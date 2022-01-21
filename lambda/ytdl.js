// Copyright (C) 2012-present by fent
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
process.env.YTDL_NO_UPDATE = '1';
const ytdl = require('ytdl-core');
const ytdlInfo = require('ytdl-core/lib/info');
const utils = require('ytdl-core/lib/utils');
const sig = require('ytdl-core/lib/sig');
const formatUtils = require('ytdl-core/lib/format-utils');

exports.getInfo = async(id, options) => {
  let info = await ytdl.getBasicInfo(id, options);
  let funcs = [];
  if (info.formats.length) {
    // Only decipher the highest quality audio to save network bandwidth
    info.formats = info.formats.filter(fmt => fmt.mimeType.startsWith('audio'));
    info.formats = [info.formats.reduce((f0, f1) => (f0.bitrate > f1.bitrate) ? f0 : f1)];
    info.html5player = info.html5player || getHTML5player(await getWatchHTMLPageBody(id, options));
    if (!info.html5player) {
      throw Error('Unable to find html5player file');
    }
    const html5player = new URL(info.html5player, BASE_URL).toString();
    funcs.push(sig.decipherFormats(info.formats, html5player, options));
  }

  let results = await Promise.all(funcs);
  info.formats = Object.values(Object.assign({}, ...results));
  return info;
};

const BASE_URL = 'https://www.youtube.com/watch?v=';
const getWatchHTMLURL = (id, options) => `${BASE_URL + id}&hl=${options.lang || 'en'}`;
const getWatchHTMLPageBody = (id, options) => {
  const url = getWatchHTMLURL(id, options);
  return ytdlInfo.watchPageCache.getOrSet(url, () => utils.exposedMiniget(url, options).text());
};

const getHTML5player = body => {
  let html5playerRes =
    /<script\s+src="([^"]+)"(?:\s+type="text\/javascript")?\s+name="player_ias\/base"\s*>|"jsUrl":"([^"]+)"/
      .exec(body);
  return html5playerRes ? html5playerRes[1] || html5playerRes[2] : null;
};
