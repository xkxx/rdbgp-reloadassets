var fs = require('fs');
var fsobserve = require('fsobserve');
var path = require('path');
var urlparse = require('url').parse;
var injectedScript = fs.readFileSync(require.resolve('./injected-bundle.js'), 'utf-8');

var assetTypes = new Set(["Font", "Image", "Media", "TextTrack"]);

function hotpatch(client, options) {
  if (!options) {
    options = {};
  }

  var resolve = options.resolve || function(url, callback) {
    var urlobj = urlparse(url || '');

    var filename = path.normalize(urlobj.pathname || '');
    console.info('filename', filename)
    if (/^http/.test(urlobj.protocol)) {
      filename = path.resolve(process.cwd(), filename.slice(1));
    }

    console.info('filename', filename)

    fs.realpath(filename, callback);
  };

  var transform = options.transform || function(source, callback) {
    return callback(null, source);
  };

  var assets = {};

  // a FrameResource obj has to contain three fields:
  // url, type and mimeType - Page/#type-FrameResource
  var parseNetworkResource = function(resource) {
    console.info(resource)
    if (assetTypes.has(resource.type)) {
      resolve(resource.url, function(error, filename) {
        if (filename) {
          assets[filename] = resource;
          watch.add(filename);
        }
        console.info(resource.url, filename)
        console.info('assets:',assets)
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
    client.request("Page.addScriptToEvaluateOnLoad", {
      scriptSource: injectedScript
    }, function(err, result) {
      console.info('add script to eval', err, result)
    });
    client.request('Page.getResourceTree',
      function(error, result) {
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
    // if (response.method === 'DOM.documentUpdated') {
    //   console.info('remove all stylesheets!')
    //   Object.keys(styleSheets).forEach(function(key) {
    //     delete styleSheets[key];
    //   });
    // }

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

    // if (response.method === 'CSS.styleSheetAdded') {
    //   var styleSheet = response.params.header;
    //
    //   if (styleSheet.isInline || !styleSheet.sourceURL) {
    //     return;
    //   }
    //
    //   resolve(styleSheet.sourceURL, function(error, filename) {
    //     if (filename) {
    //       styleSheets[filename] = styleSheet;
    //       watch.add(filename);
    //     }
    //     console.info(styleSheet.sourceURL, filename)
    //     console.info('sheets:',styleSheets)
    //   });
    // }
  });

  var watch = fsobserve();
  watch.on('data', function(change) {
    var filename = change.name;

    if (change.type === 'update') {
      console.info(assets, filename)
      if (assets[filename]) {
        var payload = JSON.stringify({
          detail: Object.assign({localpath: filename}, assets[filename])
        });
        console.info(payload)
        var customEvent = `window.dispatchEvent(new CustomEvent("assetUpdate", ${payload}));`;
        console.info(customEvent)
        client.request("Runtime.evaluate", {
          expression: customEvent
        }, function(error, res) {
          if (error) {
            console.error("Failed to send update event:", error);
          }
          console.info("event sent!")
        });
        console.info('got it!')
      }
    }
  });

  return watch;
}

module.exports = hotpatch;
