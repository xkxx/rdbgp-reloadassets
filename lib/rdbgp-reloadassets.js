var fs = require('fs');
var fsobserve = require('fsobserve');
var path = require('path');
var urlparse = require('url').parse;
var reloadHelper = require('./reload-helper');
var assetTypes = new Set(["Font", "Image", "Media", "TextTrack"]);

function hotpatch(client, options) {
  if (!options) {
    options = {};
  }

  var resolve = options.resolve || function(url, callback) {
    var urlobj = urlparse(url || '');

    var filename = path.normalize(urlobj.pathname || '');
    if (/^http/.test(urlobj.protocol)) {
      // remove leading `/` to force relative pathing
      filename = path.resolve(process.cwd(), filename.slice(1));
    }

    fs.realpath(filename, callback);
  };

  var transform = options.transform || function(source, callback) {
    return callback(null, source);
  };

  var assets = {};

  // a FrameResource obj has to contain three fields:
  // url, type and mimeType - Page/#type-FrameResource
  var parseNetworkResource = function(resource) {
    if (assetTypes.has(resource.type)) {
      resolve(resource.url, function(error, filename) {
        if (filename) {
          assets[filename] = resource;
          watch.add(filename);
        }
        console.info(resource.url, filename);
      });
    }
  };

  var parseResourceTree = function(tree) {
    tree.resources.forEach(parseNetworkResource);
    (tree.childFrames || []).forEach(parseResourceTree);
  };

  var initializeClient = function() {
    client.request('DOM.enable');
    client.request('CSS.enable');
    client.request('Network.enable');
    client.request('Page.enable');
    client.request('Page.getResourceTree', function(error, result) {
        if (error) {
          console.error(error);
        }

        parseResourceTree(result.frameTree);
    });
  };

  if (client.socket) {
    initializeClient();
  }
  client.on('ready', initializeClient);

  client.on('data', function(response) {
    var method = response.method;
    var params = response.params;

    // chrome appear to be using Network.responseReceived
    // for events beyond the official spec.
    // so we need to really make sure it's what we want
    if (method == 'Network.responseReceived' &&
      params && params.type) {
      // console.info('responseReceived')
      // console.info(response)
      var resource = params.response;
      resource.type = params.type;
      parseNetworkResource(resource);
    }
  });

  var watch = fsobserve();
  var reloadAsset = reloadHelper(client);
  watch.on('data', function(change) {
    var filename = change.name;

    if (change.type === 'update') {
      if (assets[filename]) {
        console.info(assets, filename);
        reloadAsset(assets[filename], filename);
      }
    }
  });

  return watch;
}

module.exports = hotpatch;
