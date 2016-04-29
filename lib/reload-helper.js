var srcsetParser = require('srcset');
var path = require('path');
var url = require('url');
var bluebird = require('bluebird');
var NodeIdStore = require('./nodeid-store');

// https://www.w3.org/TR/CSS2/syndata.html#value-def-uri
var cssUrlPattern = /url\(\s*['"]?(.+?)['"]?\s*\)/gi;

var getAssetSelector = function(filename) {
  // conservative: reload all urls matching base filename
  var base = path.basename(filename);
  return `[src*="${base}"], [srcset*="${base}"], [poster*="${base}"]`;
};

var optionallyReloadUri = function(filename, uri) {
  var parsedUri = url.parse(uri, true);
  // conservative: reload all urls matching base filename
  // console.info(path.basename(filename), path.basename(parsedUri.pathname))
  if (path.basename(filename) == path.basename(parsedUri.pathname)) {
    parsedUri.search = null;
    parsedUri.query['timestamp'] = Date.now();
    return url.format(parsedUri);
  }
  else {
    return uri;
  }
};

var optionallyReloadSrcset = function(filename, srcset) {
  var parsedSrcset = srcsetParser.parse(srcset);
  var changed = false;
  parsedSrcSet.forEach(function(obj) {
    var newUri = optionallyReloadUri(filename, obj.url);
    if (newUri != obj.url) {
      obj.url = newUri;
      changed = true;
    }
  });

  return changed ? srcsetParser.stringify(parseSrcset) : srcset;
};

var optionallyReloadCssProp = function(filename, prop) {
  var changed = false;
  var newProp = prop.replace(cssUrlPattern, function(match, url) {
    var newUrl = optionallyReloadUri(filename, url);
    if (newUrl != url) {
      changed = true;
      return 'url("' + newUrl + '")';
    }
    else {
      return match;
    }
  });

  return changed ? newProp : prop;
};

var reloadRules = [
  ['src', optionallyReloadUri],
  ['poster', optionallyReloadUri],
  ['srcset', optionallyReloadSrcset]
];

module.exports = function(client) {
  client.requestAsync = bluebird.promisify(client.request, {context: client});
  var nodeIdStore = new NodeIdStore(client);

  var reloadDom = function(filename) {
    client.requestAsync('DOM.getDocument')
    .then(function(res) {
      var rootid = res.root.nodeId;
      return client.requestAsync('DOM.querySelectorAll', {
        nodeId: rootid,
        selector: getAssetSelector(filename)
      });
    })
    .get('nodeIds')  // get list of node ids
    .then(nodeIdStore.requestIds)  // trade them for list of nodes
    .map(function(node) {  // for each node
      return bluebird.each(reloadRules, function(rule) {
        var attr = rule[0];
        var reloadFunc = rule[1];
        if (node.attributes[attr]) {
          var val = node.attributes[attr];
          var newVal = reloadFunc(filename, val);
          if (val != newVal) {
            console.info("reloading", newVal);

            return client.requestAsync('DOM.setAttributeValue', {
              nodeId: node.nodeId,
              name: attr,
              value: newVal
            });
          }
        }
      });
    })
    .catch(function(err) {
      console.error(err);
    });
  };

  return function reloadAsset(asset, filename) {
    reloadDom(filename);

  };
};

var reloadCss = function(filename) {
  forEach.call(document.styleSheets, function(styleSheet) {
    forEach.call(styleSheet.cssRules || styleSheet.rules || [],
    function(cssRule) {
      forEach.call(cssRule.style || [], function(propName) {
        var val = cssRule.style.getPropertyValue(propName);
        var newVal = optionallyReloadCssProp(filename, val);
        if (val != newVal) {
          var prio = cssRule.style.getPropertyPriority(propName);
          console.info("reloading", newVal);
          cssRule.style.setProperty(propName, newVal, prio);
        }
      });
    });
  });
};
