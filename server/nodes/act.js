// nodes/act.js
import { searchDocuments } from "../tools/searchDocs.js";

export async function actNode(state) {
  const docs = await searchDocuments(state.lastQuestion);

  return {
    ...state,
    retrievedDocs: docs
  };
}
