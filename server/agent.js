
import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./agentState.js";
import { reasonNode } from "./nodes/reason.js";
import { actNode } from "./nodes/act.js";
import { reflectNode } from "./nodes/reflect.js";

const graph = new StateGraph(AgentState);

graph.addNode("reason", reasonNode);
graph.addNode("act", actNode);
graph.addNode("reflect", reflectNode);

graph.addEdge("reason", "act");
graph.addEdge("act", "reflect");

graph.setEntryPoint("reason");

export const agent = graph.compile();
