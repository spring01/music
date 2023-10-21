const fs = require('fs');
const AWS = require('aws-sdk');
const { google } = require('googleapis');

async function main() {
  const filename = process.argv.length > 2 ? process.argv[2] : 'links.json';
  const links = JSON.parse(fs.readFileSync(filename));
  const youtube = google.youtube('v3');
  const docClient = new AWS.DynamoDB.DocumentClient();
  var names = [];
  for (let start = 0; start < links.length; start += 5) {
    const promises = links.slice(start, start+5).map(async link => {
      if (!link) return;
      const [prefix, playlistId] = link.split('playlist?list=');
      const playlist = await youtube.playlists.list({
        key: process.env.GOOGLE_API_KEY,
        id: playlistId,
        part: 'id,snippet',
      });
      const numList = playlist.data.items.length;
      if (numList != 1) {
        console.error(`Found too many playlists (${numList}).`);
        return;
      }
      const title = playlist.data.items[0].snippet.title;
      names.push(title);
      const params = {
        TableName: 'WebPlaylist',
        Item: {title, link}
      };
      return docClient.put(params, function(err, data) {
        if (err) {
          console.error('Error', err);
        } else {
          console.log('Successfully uploaded', title, 'to WebPlaylist.');
        }
      });
    });
    for (const promise of promises) {
      await promise;
    }
  }
  var catalog = {
    type: "AMAZON.MusicPlaylist",
    version: 2.0,
    locales: [new Locale()],
    entities: [],
  };
  for (const name of names) {
    catalog.entities.push(new Entity(name));
  }
  fs.writeFileSync('catalog.json', JSON.stringify(catalog, null, 2));
  const catalogId = process.env.PLAYLIST_CATALOG_ID;
  if (!catalogId) {
    catalogId = '<YOUR-CATALOG-ID>';
  }
  console.log('Generated catalog.json; upload using the following command:');
  console.log(`>> ask smapi upload-catalog -c ${catalogId} -f catalog.json`);
  console.log('Track uploading progress using the following command:');
  console.log(`>> ask smapi get-content-upload-by-id -c ${catalogId} --upload-id [THE-UPLOAD-ID-PRINTED-ABOVE]`);
}

class Locale {
  country = 'US';
  language = 'en';
}

class Entity {
  constructor(name) {
    this.id = name;
    this.names = [new Names(name)];
    this.popularity = new Popularity();
    this.lastUpdatedTime = new Date().toISOString();
  }
}

class Names {
  language = 'en';
  constructor(name) {
    this.value = name;
  }
}

class Popularity {
  default = 90;
}

main();
