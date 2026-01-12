import { createAgentGraph } from "../agents/agentGraph.js";
import { hasDocumentsForSession } from "../utils/documentQuery.js";
import { getOrCreateSession } from "../utils/sessionManager.js";
import { saveConversationMessage } from "../services/conversationService.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

export async function chat(req, res) {
  const { question, sessionId } = req.body;

  try {
    // Get or create session for conversation memory
    const { sessionId: currentSessionId, threadId, checkpointer, isNew } = getOrCreateSession(sessionId);
    console.log("🔗 Session ID:", currentSessionId);
    console.log(`💾 Memory Status: ${isNew ? 'NEW session - starting fresh conversation' : 'EXISTING session - conversation history preserved'}`);
    
    // Save user message to database
    try {
      await saveConversationMessage({
        sessionId: currentSessionId,
        role: "USER",
        content: question,
        metadata: {
          isNewSession: isNew,
          memoryActive: true,
        },
      });
    } catch (logError) {
      console.error("⚠️ Failed to log user message:", logError);
      // Continue execution even if logging fails
    }
    
    // Check if documents exist for this session (before routing)
    const documentsExist = await hasDocumentsForSession(currentSessionId);
    console.log("📄 Documents exist in Pinecone for session:", documentsExist);
    
    // Create the agent graph with session-specific tools
    const graph = createAgentGraph(currentSessionId);
    
    // Compile graph with checkpointer for memory
    const compiledGraph = graph.compile({
      checkpointer: checkpointer,
    });
    
    // Create config with threadId for checkpointing
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };
    
    // Create initial state with new user message
    // LangGraph's MessagesAnnotation reducer should automatically append this to checkpointed messages
    const initialState = {
      messages: [new HumanMessage(question)],
      sessionId: currentSessionId,
      routerDecision: null,
      documentsExist: documentsExist || false,
    };
    
    console.log(`💬 User question: "${question}"`);
    console.log(`📝 Initial state messages count: ${initialState.messages.length}`);
    
    // Invoke the graph - LangGraph will automatically restore checkpointed state and merge
    const result = await compiledGraph.invoke(initialState, config);
    
    // Extract the AI message from the result
    const messages = result.messages || [];
    console.log(`📊 Total messages in result: ${messages.length}`);
    console.log(`📝 Message types: ${messages.map(m => m.constructor.name).join(', ')}`);
    
    // Find the LAST AIMessage (not the first!) - reverse the array and find first AIMessage
    const lastAIMessage = messages.slice().reverse().find(msg => msg instanceof AIMessage);
    const answer = lastAIMessage?.content 
      ? (typeof lastAIMessage.content === 'string' 
          ? lastAIMessage.content 
          : String(lastAIMessage.content))
      : "";
    
    console.log(`🎯 Extracted answer from ${lastAIMessage ? 'LAST' : 'NO'} AIMessage`);

    console.log(`✅ Memory: Conversation stored in LangGraph checkpoint (${currentSessionId.substring(0, 8)}...)`);
    console.log(`💬 Answer length: ${answer.length}, Answer preview: ${answer.substring(0, 100)}...`);

    // Save bot response to database
    let messageId = null;
    try {
      const savedMessage = await saveConversationMessage({
        sessionId: currentSessionId,
        role: "ASSISTANT",
        content: answer.trim(),
        routerDecision: result.routerDecision || null,
        agentType: result.agentType || null,
        metadata: {
          isNewSession: isNew,
          memoryActive: true,
          documentsExist,
        },
      });
      messageId = savedMessage.id;
    } catch (logError) {
      console.error("⚠️ Failed to log bot response:", logError);
      // Continue execution even if logging fails
    }

    // Return JSON response
    res.json({
      answer: answer.trim(),
      sessionId: currentSessionId,
      status: "completed",
      memoryActive: true,
      isNewSession: isNew,
      ...(messageId && { messageId }),
    });

  } catch (err) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: "Chat processing failed" });
  }
}
