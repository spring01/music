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
const { google } = require('googleapis');
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
    const mediaType = attributes.find(({ type }) => {
      return type === 'MEDIA_TYPE';
    });
    const entity = attributes.find(({ type }) => {
      return type === mediaType.value;
    });
    if (mediaType.value == 'PLAYLIST') {
      const queue = new PlaylistQueue(entity.entityId);
      await queue.initialize();
      return queue;
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
    } else {
      return new PlaylistQueue(event.payload.contentId);
    }
  }
  async buildPayload(event, queue) {
    const entry = await queue.getInitial();
    const item = new Item(entry);
    return {playbackMethod: new PlaybackMethod(queue, item)};
  }
}

class PlayQueueHandler extends Handler {
  namespace = 'Alexa.Audio.PlayQueue';
  async getQueue(event) {
    if (event.payload.currentItemReference.queueId === allMusicQueue.id) {
      return allMusicQueue;
    } else {
      return new PlaylistQueue(event.payload.currentItemReference.queueId);
    }
  }
  async buildPayload(event, queue) {
    const currentId = event.payload.currentItemReference.id;
    const entry = await queue[this.queueGetterName](currentId);
    return {
      isQueueFinished: queue.isFinished,
      item: new Item(entry),
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

class Entry {
  constructor(id, artist, album, title, uri) {
    this.id = id;
    this.artist = artist;
    this.album = album;
    this.title = title;
    this.uri = uri;
  }
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
    return this.getResolvedEntryAsync(currentId, /*scanForward=*/true);
  }
  async getPrevious(currentId) {
    return this.getResolvedEntryAsync(currentId, /*scanForward=*/false);
  }
  async getResolvedEntryAsync(currentId, scanForward = true) {
    const entry = await this.queryOneEntryAsync(currentId, scanForward);
    const [artist, album, title] = entry.ArtistAlbumTitle.split(DELIM);
    const uri = await resolveLink(entry.Link);
    return new Entry(entry.ArtistAlbumTitle, artist, album, title, uri);
  }
  async queryOneEntryAsync(currentId, scanForward) {
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
    return await db.queryOneEntryAsync({
      TableName: 'WebMusic',
      IndexName: 'IsMusic-ArtistAlbumTitle-index',
      KeyConditionExpression: expr,
      ExpressionAttributeValues: attr,
      ScanIndexForward: scanForward,
    });
  }
}

const allMusicQueue = new AllMusicQueue();

const youtube = google.youtube('v3');

class PlaylistQueue {
  constructor(name) {
    name = name.toLowerCase();
    this.id = name;
    this.name = name;
    this.isFinished = false;  // TODO: implement non-repeating
  }
  async initialize() {
    const playlist = await this.readPlaylistFromDb('WebPlaylist');
    const title = playlist.title;
    const link = playlist.link;
    const [prefix, playlistId] = link.split('playlist?list=');
    const results = await youtube.playlistItems.list({
      key: process.env.GOOGLE_API_KEY,
      part: 'id,snippet',
      playlistId: playlistId,
      maxResults: 50,
    });
    const songLinks = results.data.items.map(item => {
      const musicId = item.snippet.resourceId.videoId;
      return `https://music.youtube.com/watch?v=${musicId}`
    });
    shuffle(songLinks);  // TODO: implement non-shuffling
    await this.writePlaylistToDb({title, link, songLinks});
  }
  async getInitial() {
    const playlist = await this.readPlaylistFromDb();
    return this.fetchEntry(playlist, 0);
  }
  async getNext(currentId) {
    const playlist = await this.readPlaylistFromDb();
    const id = (parseInt(currentId) + 1) % playlist.songLinks.length;
    return this.fetchEntry(playlist, id);
  }
  async getPrevious(currentId) {
    const playlist = await this.readPlaylistFromDb();
    const numSongs = playlist.songLinks.length;
    const id = (numSongs + parseInt(currentId) - 1) % numSongs;
    return this.fetchEntry(playlist, id);
  }
  async readPlaylistFromDb(tableName = 'PlaylistMusics') {
    return db.queryOneEntryAsync({
      TableName: tableName,
      KeyConditionExpression: 'title = :title',
      ExpressionAttributeValues: {':title': this.name},
    });
  }
  async writePlaylistToDb(item) {
    return db.putAsync({
      TableName: 'PlaylistMusics',
      Item: item,
    });
  }
  async fetchEntry(playlist, id) {
    const link = playlist.songLinks[id];
    const info = await ytdl.getInfo(link);
    const {artist, album, title} = parseMetadata(info);
    return new Entry(id.toString(), artist, album, title, info.formats[0].url);
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

const YOUTUBE_DELIM = ' · ';

function parseMetadata(info) {
  var artist = null, album = null, title = null;
  const videoDetails = info.videoDetails;
  const description = videoDetails.description;
  if (!description) {
    title = videoDetails.title;
  }
  if (description && description.endsWith('Auto-generated by YouTube.')) {
    // Parse videoDetails.description if it's auto-generated.
    const lines = description.split('\n');
    if (lines.length > 2) {
      [title, artist] = lines[2].split(YOUTUBE_DELIM);
    }
    if (lines.length > 4) {
      album = lines[4];
    }
  } else {
    if (description) {
      title = description.replace(/(\r\n|\n|\r)/gm, '; ');
    }
    if (videoDetails.title) {
      artist = title;
      title = videoDetails.title;
    } else if (videoDetails.media) {
      artist = videoDetails.media.artist;
      title = videoDetails.media.song;
    }
  }
  if (!artist) {
    artist = 'unknown';
  }
  if (!album) {
    album = 'unknown';
  }
  if (!title) {
    title = 'unknown';
  }
  return {artist, album, title};
}

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
  constructor(entry) {
    const {id, artist, album, title, uri} = entry;
    this.id = id;
    this.playbackInfo = new PlaybackInfo();
    this.metadata = new TrackMetadata(artist, album, title);
    this.controls = bidirectionalControls();
    this.rules = new ItemRules();
    this.stream = new Stream(entry.id, uri);
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
