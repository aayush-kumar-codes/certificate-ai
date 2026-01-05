// nodes/reason.js
export async function reasonNode(state) {
    const lastUserMessage = state.messages[state.messages.length - 1];
  
    return {
      ...state,
      lastQuestion: lastUserMessage.content
    };
  }
  