 rs.initiate({
    _id: "rs0",
    members:[
      {_id: 0, host: "mongo-node-0.mongo-cluster"},
      {_id: 1, host:"mongo-node-1.mongo-cluster"},
      {_id: 2, host:"mongo-node-2.mongo-cluster"}
    ]
  }
);

rs.status();
