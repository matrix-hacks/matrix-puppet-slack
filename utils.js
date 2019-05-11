const Promise = require('bluebird');
const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const urlParse = require('url').parse;

const downloadGetStream = (url, data) => needle.get(url, data);

const downloadGetBufferAndHeaders = (url, data) => {
  return new Promise((resolve, reject) => {
    let headers = {
      'content-type': 'application/octet-stream'
    };
    let stream = downloadGetStream(url, data);
    stream.on('header', (_s, _h) => headers = _h);
    stream.pipe(concatStream((buffer)=>{
      resolve({ buffer, headers });
    })).on('error', reject);
  });
};

const downloadGetBufferAndType = async(url, data) => {
  const { buffer, headers } = await downloadGetBufferAndHeaders(url, data);
  let type, contentType = headers['content-type'];
  if ( contentType ) {
    type = contentType;
  } else {
    type = mime.lookup(urlParse(url).pathname);
  }
  type = type.split(';')[0];
  return { buffer, type };
};

const sleep = (timeout) => {
  return new Promise((res, rej) => {
    setTimeout(res, timeout);
  });
};

module.exports = {
  download: {
    getStream: downloadGetStream,
    getBufferAndType: downloadGetBufferAndType,
  },
  sleep,
};
