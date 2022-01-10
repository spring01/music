// Copyright 2022 Haichen Li
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const crypto = require('crypto');
const { promisify } = require('util');
const AWS = require('aws-sdk');
const ytdl = require('./ytdl');

class Handler {
  async handle(event) {
    const header = new Header(this.namespace, `${event.header.name}.Response`);
    const queue = await this.getQueue(event);
    const payload = await this.buildPayload(event, queue);
    return {header, payload}
  }
}

class GetPlayableContent extends Handler {
  namespace = 'Alexa.Media.Search';
  async getQueue(event) {
    const attributes = event.payload.selectionCriteria.attributes;
    if (attributes.length == 1 && attributes[0].type == 'MEDIA_TYPE'
        && attributes[0].value == 'TRACK') {
      return allMusicQueue;
    }
  }
  async buildPayload(event, queue) {
    return {content: new Content(queue)};
  }
}

class Initiate extends Handler {
  namespace = 'Alexa.Media.Playback';
  async getQueue(event) {
    if (event.payload.contentId === allMusicQueue.id) {
      return allMusicQueue;
    }
  }
  async buildPayload(event, queue) {
    const entry = await queue.getInitial();
    const uri = await resolveLink(entry.Link);
    const item = new Item(entry, uri);
    return {playbackMethod: new PlaybackMethod(queue, item)};
  }
}

class PlayQueueHandler extends Handler {
  namespace = 'Alexa.Audio.PlayQueue';
  async getQueue(event) {
    if (event.payload.currentItemReference.queueId === allMusicQueue.id) {
      return allMusicQueue;
    }
  }
  async buildPayload(event, queue) {
    const currentId = event.payload.currentItemReference.id;
    const entry = await queue[this.queueGetterName](currentId);
    const uri = await resolveLink(entry.Link);
    return {
      isQueueFinished: queue.isFinished,
      item: new Item(entry, uri),
    };
  }
}

class GetNextItem extends PlayQueueHandler {
  queueGetterName = 'getNext';
}

class GetPreviousItem extends PlayQueueHandler {
  queueGetterName = 'getPrevious';
}

exports.GetPlayableContent = new GetPlayableContent();
exports.Initiate = new Initiate();
exports.GetNextItem = new GetNextItem();
exports.GetPreviousItem = new GetPreviousItem();

const docClient = new AWS.DynamoDB.DocumentClient();
const db = {
  scanAsync: promisify(docClient.scan).bind(docClient),
  queryAsync: promisify(docClient.query).bind(docClient),
  getAsync: promisify(docClient.get).bind(docClient),
  putAsync: promisify(docClient.put).bind(docClient),
  queryOneEntryAsync : async (params) => {
    params.Limit = 1;
    const entries = await db.queryAsync(params);
    return entries.Items[0];
  },
}

class AllMusicQueue {
  constructor() {
    this.id = 'Playlist.AllMusic';
    this.name = 'All music';
    this.isFinished = false;  // Wraps around both ways and never finishes.
  }
  async getInitial() {
    const alphaBet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randInt = Math.floor(Math.random() * alphaBet.length)
    const randChar = alphaBet.charAt(randInt);
    return this.getNext(randChar)
  }
  async getNext(currentId) {
    return this.queryOneEntryAsync(currentId, /*scanForward=*/true);
  }
  async getPrevious(currentId) {
    return this.queryOneEntryAsync(currentId, /*scanForward=*/false);
  }
  async queryOneEntryAsync(currentId, scanForward = true) {
    if (currentId) {
      const entry = await this.queryOneEntryAsyncImpl(currentId, scanForward);
      if (entry) return entry;
    }
    return this.queryOneEntryAsyncImpl(null, scanForward);
  }
  async queryOneEntryAsyncImpl(currentId = null, scanForward = true) {
    var expr = 'IsMusic = :isMusic';
    var attr = {':isMusic': 1};
    if (currentId) {
      const direction = scanForward ? '>' : '<';
      expr = `${expr} and ArtistAlbumTitle ${direction} :currentId`;
      attr[':currentId'] = currentId;
    }
    return db.queryOneEntryAsync({
      TableName: 'WebMusic',
      IndexName: 'IsMusic-ArtistAlbumTitle-index',
      KeyConditionExpression: expr,
      ExpressionAttributeValues: attr,
      ScanIndexForward: scanForward,
    });
  }
}

const allMusicQueue = new AllMusicQueue();

async function resolveLink(link) {
  const info = await ytdl.getInfo(link);
  const audios = info.formats.filter(fmt => fmt.hasAudio && !fmt.hasVideo);
  const biggest = audios.reduce(
      (f0, f1) => (f0.audioBitrate > f1.audioBitrate) ? f0 : f1);
  return biggest.url;
}

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('base64');
}

function newId() {
  return hash(new Date().toISOString());
}

class Header {
  constructor(namespace, name) {
    this.namespace = namespace;
    this.name = name;
    this.messageId = newId();
    this.payloadVersion = '1.0';
  }
}

class Content {
  constructor(queue) {
    this.id = queue.id;
    this.actions = new ContentActions();
    this.metadata = new PlaylistMetadata(queue.name);
  }
}

class ContentActions {
  playable = true;
  browsable = false;
}

class PlaybackMethod {
  type = 'ALEXA_AUDIO_PLAYER_QUEUE';
  constructor(queue, firstItem) {
    this.id = queue.id;
    this.rules = new QueueFeedbackRule();
    this.firstItem = firstItem;
  }
}

class QueueFeedbackRule {
  feedback = new Feedback();
}

class Feedback {
  type = 'PREFERENCE';
  enabled = false;
}

const DELIM = ' ||| ';

class Item {
  constructor(entry, uri) {
    const [artist, album, title] = entry.ArtistAlbumTitle.split(DELIM);
    this.id = entry.ArtistAlbumTitle;
    this.playbackInfo = new PlaybackInfo();
    this.metadata = new TrackMetadata(artist, album, title);
    this.controls = bidirectionalControls();
    this.rules = new ItemRules();
    this.stream = new Stream(entry.ArtistAlbumTitle, uri);
  }
}

class PlaybackInfo {
  type = 'DEFAULT';
}

class SpeechInfo {
  type = 'PLAIN_TEXT';
  constructor(text) {
    this.text = text;
  }
}

class MetadataNameProperty {
  constructor(text) {
    this.speech = new SpeechInfo(text);
    this.display = text;
  }
}

class EntityMetadata {
  constructor(text) {
    this.name = new MetadataNameProperty(text);
  }
}

class BaseMetadata {
  type = null;
  constructor(text, sources = []) {
    this.name = new MetadataNameProperty(text);
    this.art = {sources};
  }
}

class PlaylistMetadata extends BaseMetadata {
  type = 'PLAYLIST';
}

class TrackMetadata extends BaseMetadata {
  type = 'TRACK';
  constructor(artist, album, title, sources = []) {
    super(title, sources);
    this.authors = [
      new EntityMetadata(artist),
    ];
    this.album = new EntityMetadata(album);
  }
}

class Stream {
  constructor(id, uri) {
    this.id = id;
    this.uri = uri;
    this.offsetInMilliseconds = 0;
    this.validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
}

class ItemControl {
  type = 'COMMAND';
  enabled = true;
  constructor(name) {
    this.name = name;
  }
}

function bidirectionalControls() {
  return [new ItemControl('NEXT'), new ItemControl('PREVIOUS')];
}

class ItemRules {
  feedbackEnabled = false;
}
