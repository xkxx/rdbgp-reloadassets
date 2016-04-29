var NodeIdStore = function () {
  function NodeIdStore(client) {

    this.client = client;
    this.idMap = {};
    this.client.on('data', this._eventDispatch.bind(this));
    this.requestIds = this.requestIds.bind(this);
  }

  NodeIdStore.prototype._eventDispatch = function _eventDispatch(response) {
    var method = response.method;
    var params = response.params;


    if (method == 'DOM.setChildNodes') {
      var nodes = params.nodes;
      var parentId = params.parentId;
      console.info('setChildNodes:', parentId)

      this.addNode(nodes, parentId);
    } else if (method == 'DOM.attributeModified') {
      var nodeId = params.nodeId;
      var name = params.name;
      var value = params.value;

      this.changeNodeAttr(nodeId, name, value);
    }
  };

  NodeIdStore.prototype.changeNodeAttr = function changeNodeAttr(nodeId, attr, val) {
    this.idMap[nodeId].attributes[attr] = val;
  };

  NodeIdStore.prototype.removeNodeAttr = function removeNodeAttr(nodeId, attr) {
    this.idMap[nodeId].attributes[attr] = null;
  };


  // add all Nodes in tree to idMap,
  // return [nodeId] in nodes
  NodeIdStore.prototype.addNode = function addNode(nodes, parentId) {
    var _this = this;

    return nodes.map(function (node) {
      var nodeId = node.nodeId;
      node.parentId = parentId;
      // parse attributes
      var attrs = {};
      var attrList = node.attributes || [];
      for (var i = 0; i < attrList.length; i += 2) {
        attrs[attrList[i]] = attrList[i + 1];
      }
      node.attributes = attrs;
      // recurse on children
      var children = node.children || [];
      node.children = null;
      _this.idMap[nodeId] = node;
      node.childIds = _this.addNode(children, nodeId);
      return nodeId;
    });
  };

  // assumes all id are previously received
  // chrome always sends nodes info before nodeids
  NodeIdStore.prototype.requestIds = function requestIds(ids) {
    var _this = this;

    return ids.map(function (id) {
      return _this.idMap[id];
    });
  };

  return NodeIdStore;
}();

module.exports = NodeIdStore;
