const assert = require('assert');
const skill = require('../lambda');

describe('Music', function () {
  this.timeout(50000);
  describe('GetPlayableContent default event', function () {
    const event = {
        "header": {
            "messageId": "",
            "namespace": "Alexa.Media.Search",
            "name": "GetPlayableContent",
            "payloadVersion": "1.0"
        },
        "payload": {
            "requestContext": {
                "user": {
                    "id": "",
                    "accessToken": null
                },
                "location": {
                    "originatingLocale": "en-US",
                    "countryCode": "US"
                }
            },
            "filters": {
                "explicitLanguageAllowed": true
            },
            "selectionCriteria": {
                "attributes": [
                    {
                        "type": "MEDIA_TYPE",
                        "value": "TRACK"
                    }
                ]
            },
            "responseOptions": null,
            "experience": null
        },
    };
    const promise = skill.handler(event);
    it('should return correct header namespace', async function() {
      const response = await promise;
      assert.equal(response.header.namespace, "Alexa.Media.Search");
    });
    it('should return correct header name', async function() {
      const response = await promise;
      assert.equal(response.header.name, "GetPlayableContent.Response");
    });
    it('should return correct content id', async function() {
      const response = await promise;
      assert.equal(response.payload.content.id, "Playlist.AllMusic");
    });
    it('should return correct metadata type', async function() {
      const response = await promise;
      assert.equal(response.payload.content.metadata.type, "PLAYLIST");
    });
    it('should display correctly', async function() {
      const response = await promise;
      assert.equal(response.payload.content.metadata.name.speech.text, "All music");
      assert.equal(response.payload.content.metadata.name.display, "All music");
    });
  });

  describe('GetPlayableContent playlist', function () {
    const event = {
        "header": {
            "messageId": "",
            "namespace": "Alexa.Media.Search",
            "name": "GetPlayableContent",
            "payloadVersion": "1.0"
        },
        "payload": {
            "requestContext": {
                "user": {
                    "id": "",
                    "accessToken": null
                },
                "location": {
                    "originatingLocale": "en-US",
                    "countryCode": "US"
                }
            },
            "filters": {
                "explicitLanguageAllowed": true
            },
            "selectionCriteria": {
                "attributes": [
                    {
                        "type": "PLAYLIST",
                        "entityId": "classical"
                    },
                    {
                        "type": "MEDIA_TYPE",
                        "value": "PLAYLIST"
                    }
                ]
            },
            "responseOptions": null,
            "experience": null
        }
    };
    const promise = skill.handler(event);
    it('should return correct header namespace', async function() {
      const response = await promise;
      assert.equal(response.header.namespace, "Alexa.Media.Search");
    });
    it('should return correct header name', async function() {
      const response = await promise;
      assert.equal(response.header.name, "GetPlayableContent.Response");
    });
    it('should return valid content id', async function() {
      const response = await promise;
      assert.notEqual(response.payload.content.id, "");
      assert.notEqual(response.payload.content.id, null);
    });
    it('should return correct metadata type', async function() {
      const response = await promise;
      assert.equal(response.payload.content.metadata.type, "PLAYLIST");
    });
    it('should display correctly', async function() {
      const response = await promise;
      assert.notEqual(response.payload.content.metadata.name.speech.text, "");
      assert.notEqual(response.payload.content.metadata.name.display, null);
    });
  });

  describe("Initiate all music queue", function () {
    const event = {
        "header": {
            "messageId": "",
            "namespace": "Alexa.Media.Playback",
            "name": "Initiate",
            "payloadVersion": "1.0"
        },
        "payload": {
            "requestContext": {
                "user": {
                    "id": "",
                    "accessToken": null
                },
                "location": {
                    "originatingLocale": "en-US",
                    "countryCode": "US",
                    "timeZone": "America/Los_Angeles"
                }
            },
            "playbackModes": {
                "shuffle": false,
                "loop": false,
                "repeat": null
            },
            "currentItemReference": null,
            "contentId": "Playlist.AllMusic",
            "filters": {
                "explicitLanguageAllowed": true
            },
            "experience": null
        }
    };
    const promise = skill.handler(event);
    it('should return correct header namespace', async function() {
      const response = await promise;
      assert.equal(response.header.namespace, "Alexa.Media.Playback");
    });
    it('should return correct header name', async function() {
      const response = await promise;
      assert.equal(response.header.name, "Initiate.Response");
    });
    it('should return correct playbackMethod id', async function() {
      const response = await promise;
      assert.equal(response.payload.playbackMethod.id, "Playlist.AllMusic");
    });
    it('should return valid firstItem id', async function() {
      const response = await promise;
      assert.notEqual(response.payload.playbackMethod.firstItem.id, "");
      assert.notEqual(response.payload.playbackMethod.firstItem.id, null);
    });
    it('should return correct metadata type', async function() {
      const response = await promise;
      assert.equal(response.payload.playbackMethod.firstItem.metadata.type, "TRACK");
    });
    it('should display correctly', async function() {
      const response = await promise;
      const metadata = response.payload.playbackMethod.firstItem.metadata;
      const authorName = metadata.authors[0].name
      assert.notEqual(authorName.speech.text, "");
      assert.equal(authorName.speech.text, authorName.display);
      const albumName = metadata.album.name
      assert.notEqual(albumName.speech.text, "");
      assert.equal(albumName.speech.text, albumName.display);
    });
    it('should return valid stream', async function() {
      const response = await promise;
      const firstItem = response.payload.playbackMethod.firstItem;
      const stream = firstItem.stream;
      assert.equal(stream.id, firstItem.id);
      assert.notEqual(stream.uri, null);
      assert.notEqual(stream.uri, "");
    });
  });

  describe("GetNextItem all music queue", function () {
    const event = {
        "header": {
            "messageId": "",
            "namespace": "Alexa.Audio.PlayQueue",
            "name": "GetNextItem",
            "payloadVersion": "1.0"
        },
        "payload": {
            "requestContext": {
                "user": {
                    "id": "",
                    "accessToken": null
                },
                "location": {
                    "originatingLocale": "en-US",
                    "countryCode": "US"
                }
            },
            "policies": null,
            "currentItemReference": {
                "contentId": "Playlist.AllMusic",
                "queueId": "Playlist.AllMusic",
                "id": "周杰伦 ||| 叶惠美 ||| 她的睫毛"
            },
            "isUserInitiated": false
        }
    };
    const promise = skill.handler(event);
    it('should return correct header namespace', async function() {
      const response = await promise;
      assert.equal(response.header.namespace, "Alexa.Audio.PlayQueue");
    });
    it('should return correct header name', async function() {
      const response = await promise;
      assert.equal(response.header.name, "GetNextItem.Response");
    });
    it('should return queue unfinished', async function() {
      const response = await promise;
      assert.equal(response.payload.isQueueFinished, false);
    });
    it('should return valid item id', async function() {
      const response = await promise;
      assert.notEqual(response.payload.item.id, "");
      assert.notEqual(response.payload.item.id, null);
    });
    it('should return correct metadata type', async function() {
      const response = await promise;
      assert.equal(response.payload.item.metadata.type, "TRACK");
    });
    it('should display correctly', async function() {
      const response = await promise;
      const metadata = response.payload.item.metadata;
      const authorName = metadata.authors[0].name
      assert.notEqual(authorName.speech.text, "");
      assert.equal(authorName.speech.text, authorName.display);
      const albumName = metadata.album.name
      assert.notEqual(albumName.speech.text, "");
      assert.equal(albumName.speech.text, albumName.display);
    });
    it('should return valid stream', async function() {
      const response = await promise;
      const item = response.payload.item;
      const stream = item.stream;
      assert.equal(stream.id, item.id);
      assert.notEqual(stream.uri, null);
      assert.notEqual(stream.uri, "");
    });
  });

  describe("GetPreviousItem all music queue", function () {
    const event = {
      "header": {
        "namespace": "Alexa.Audio.PlayQueue",
        "name": "GetPreviousItem",
        "messageId": "",
        "payloadVersion": "1.0"
      },
      "payload": {
        "requestContext": {
          "user": {
            "id": "",
            "accessToken": ""
          },
          "location": {
            "originatingLocale": "en-US"
          }
        },
        "currentItemReference": {
          "id": "Avril Lavigne ||| Let Go ||| Complicated",
          "queueId": "Playlist.AllMusic",
          "contentId": "Playlist.AllMusic"
        }
      }
    };
    const promise = skill.handler(event);
    it('should return correct header namespace', async function() {
      const response = await promise;
      assert.equal(response.header.namespace, "Alexa.Audio.PlayQueue");
    });
    it('should return correct header name', async function() {
      const response = await promise;
      assert.equal(response.header.name, "GetPreviousItem.Response");
    });
    it('should return queue unfinished', async function() {
      const response = await promise;
      assert.equal(response.payload.isQueueFinished, false);
    });
    it('should return valid item id', async function() {
      const response = await promise;
      assert.notEqual(response.payload.item.id, "");
      assert.notEqual(response.payload.item.id, null);
    });
    it('should return correct metadata type', async function() {
      const response = await promise;
      assert.equal(response.payload.item.metadata.type, "TRACK");
    });
    it('should display correctly', async function() {
      const response = await promise;
      const metadata = response.payload.item.metadata;
      const authorName = metadata.authors[0].name
      assert.notEqual(authorName.speech.text, "");
      assert.equal(authorName.speech.text, authorName.display);
      const albumName = metadata.album.name
      assert.notEqual(albumName.speech.text, "");
      assert.equal(albumName.speech.text, albumName.display);
    });
    it('should return valid stream', async function() {
      const response = await promise;
      const item = response.payload.item;
      const stream = item.stream;
      assert.equal(stream.id, item.id);
      assert.notEqual(stream.uri, null);
      assert.notEqual(stream.uri, "");
    });
  });
});
