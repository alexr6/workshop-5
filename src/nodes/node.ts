import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

type NodeState = {
  killed: boolean; // this is used to know if the node was stopped by the /stop route. It's important for the unit tests but not very relevant for the Ben-Or implementation
  x: 0 | 1 | "?" | null; // the current consensus value
  decided: boolean | null; // used to know if the node reached finality
  k: number | null; // current step of the node
};

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

 
  let NodeState: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null
  };

  if(!isFaulty){
    NodeState = {
      killed: false,
      x: initialValue,
      decided: null,
      k: 0
    };
  }
  

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if(isFaulty){
      res.status(500).send("faulty")
    }
    else{
      res.status(200).send("live")
    }
  });


  // this route allows the node to receive messages from other nodes
  node.post("/message", (req, res) => {
    const {k, v} = req.body;
    if (k === NodeState.k) {  //current step
      if (NodeState.x === null){  //no value
        NodeState.x = v;
        res.send("OK");
      } 
      else if (NodeState.x === v) {  //consensus
        NodeState.decided =true;
        res.send("OK");
      }
      else {  //no consensus
        res.send("OK");
      }
    }
    else {  //old message, ignore
      res.send("OK")
    }
  });

/*
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    let k = 0;
    while(!NodeState.decided && !NodeState.killed) {
      //k <- k + 1
      k++;
      NodeState.k = k;
      const message = {k, x: NodeState.x};
      //send (R, k, x) to all processes
      for( let i = 0; i < N; i++) {
        if (i !== nodeId) {
          await sendMessage(i, message)
        }
      }
      
      //wait for messages of the form (R, k, *) from N-F processes {* can be 0 or 1}
      await waitForMessages(k, N, F);
      
      //if recieved more than N/2 (R, k, v) with the same v
      // Check if received at least N/2 (P, k, v) with the same v != ?
      // Check if received more than N/2 (R, k, v) with the same v
      const receivedValues = await getReceivedValues(k, N, F);
      const consensusValue = getConsensusValue(receivedValues, N, F);
      //then send (P, k, v) to all processes
      //else send (P, k, ?) to all processes
      
      const messageType = consensusValue !== "?" ? consensusValue : "?";
      const replyMessage = { k, v: messageType };
      for (let i = 0; i < N; i++) {
        if (i !== nodeId) {
          await sendMessage(i, replyMessage);
        }
      }
    
      //wait for messages of the form (P, k, *) from N - F processes {* can be 0, 1 or ?}
      await waitForMessages(k, N, F);
      
      // Check if received at least F + 1 (P, k, v) with the same v != ?
      const receivedDecidedValues = await getReceivedDecidedValues(k, N, F);
      const decidedValue = getDecidedValue(receivedDecidedValues, F);
      //if recieved at least F + 1 (P, k, v) with the same v != ?, then decide(v)
      //if at least one (P, k, v) with v != ? then x <- v else x <- 0 or 1 randomly {query r.n.g}
      
      // If at least one (P, k, v) with v != ?, then decide(v)
      // else x <- 0 or 1 randomly
      if (decidedValue !== null) {
        NodeState.x = decidedValue;
        NodeState.decided = true;
      } else {
        NodeState.x = Math.round(Math.random()) as 0|1;
      }    
    }
    server.close(() => {
      console.log(`Server for ${nodeId} closed`);
    });
    res.send("Consensus reached")
    
  });
*/

  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    NodeState.killed = true
    server.close(() => {
      console.log(`Server for ${nodeId} closed`)
    })
    res.send("Stopped")
  });

  // get the current state of a node
  node.get("/getState", (req, res) => {
    res.json(NodeState);
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;

  //Message sending function
  async function sendMessage(nodeID : number, message: any) {
    try {
      await fetch(`http://localhost:${BASE_NODE_PORT + nodeId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message)
      });
    }catch (error) {
      console.error("Error sending message")
    }
  }
  



  // Function to wait for messages of the form (R, k, *) from N-F processes
async function waitForMessages(k: number, N: number, F: number) {
  const receivedMessages: { [key: number]: boolean } = {}; // Store received messages for each process
  let receivedCount = 0; // Count of received messages

  // Function to handle incoming messages
  function handleMessage(message: any) {
    const { k: messageK, senderId } = message;
    if (messageK === k) {
      const { senderId } = message;
      if (!receivedMessages[senderId]) {
        receivedMessages[senderId] = true;
        receivedCount++;
      }
    }
  }

  // Listen for incoming messages
  node.on("message", handleMessage);

  // Wait until enough messages are received
  while (receivedCount < N - F) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Adjust the timeout as needed
  }

  // Stop listening for messages
  node.removeListener("message", handleMessage);
}

// This function recieves the values 
async function getReceivedValues(k: number, N: number, F: number) {
  const receivedValues: { [key: number]: Value } = {}; // Store received values for each process

  // Function to handle incoming messages
  function handleMessage(message: any) {
    const { k: messageK, senderId, v } = message;
    if (messageK === k) {
      receivedValues[senderId] = v;
    }
  }

  // Listen for incoming messages
  node.on("message", handleMessage);

  // Wait until enough messages are received
  while (Object.keys(receivedValues).length < N - F) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Adjust the timeout as needed
  }

  // Stop listening for messages
  node.removeListener("message", handleMessage);

  return receivedValues;
}

// Function to determine the consensus value from received values
function getConsensusValue(receivedValues: { [key: number]: Value }, N: number, F: number): Value {
  const counts: { [key in Value]?: number } = {}; // Store counts for each value

  // Count occurrences of each value
  for (const senderId in receivedValues) {
    const value = receivedValues[senderId];
    counts[value] = (counts[value] || 0) + 1;
  }

  // Check if there's a value with more than N/2 occurrences
  for (const value in counts) {
    if (counts[value as Value]! > N / 2) {
      return value as Value;
    }
  }

  // If no value has more than N/2 occurrences, return "?"
  return "?";
}

// Function to get received decided values of the form (P, k, v)
async function getReceivedDecidedValues(k: number, N: number, F: number): Promise<{ [key: number]: Value }> {
  const receivedDecidedValues: { [key: number]: Value } = {}; // Store received decided values for each process

  // Function to handle incoming messages
  function handleMessage(message: any) {
    const { k: messageK, senderId, v } = message;
    if (messageK === k && v !== "?") {
      if (!receivedDecidedValues[senderId]) {
        receivedDecidedValues[senderId] = v;
      }
    }
  }

  // Listen for incoming messages
  node.on("message", handleMessage);

  // Wait until enough messages are received
  while (Object.keys(receivedDecidedValues).length < F + 1) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Adjust the timeout as needed
  }

  // Stop listening for messages
  node.removeListener("message", handleMessage);

  return receivedDecidedValues;
}

// Function to determine the decided value from received decided values
function getDecidedValue(receivedDecidedValues: { [key: number]: Value }, F: number): Value | null {
  const counts: { [key in Value]?: number } = {}; // Store counts for each value

  // Count occurrences of each value
  for (const senderId in receivedDecidedValues) {
    const value = receivedDecidedValues[senderId];
    counts[value] = (counts[value] || 0) + 1;
  }

  // Check if there's a value with at least F + 1 occurrences
  for (const value in counts) {
    if (counts[value as Value]! >= F + 1) {
      return value as Value;
    }
  }

  // If no value has at least F + 1 occurrences, return null
  return null;
}

}
