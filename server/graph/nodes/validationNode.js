import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { STATUS } from "../state.js";
import { PineconeStore } from "@langchain/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { pinecone } from "../../utils/pineconedb.js";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  dimensions: 1024,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Validation node: Uses Pinecone + LLM to validate the certificate
 * according to arbitrary, user-defined criteria.
 * Only runs when criteria are present and status is ready_to_validate.
 */
export async function validationNode(state) {
  const { criteria, criteriaDescription, status } = state;

  // Defensive check: don't proceed without criteria
  if ((!criteria || Object.keys(criteria).length === 0) && !criteriaDescription) {
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content:
            "I need evaluation criteria before I can validate the certificate. Please specify how you want to evaluate it."
        }
      ]
    };
  }

  if (status !== STATUS.READY_TO_VALIDATE) {
    return state;
  }

  // 1) Build a retriever over the existing Pinecone index using the same
  // embeddings configuration as the upload step.
  const index = pinecone.Index(process.env.PINECONE_INDEX);
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
  });

  // Use a combined query that mentions it's for certificate validation
  // and includes the natural-language criteria description.
  const queryText =
    criteriaDescription ||
    `Validate the uploaded certificate using these criteria: ${JSON.stringify(criteria)}`;

  const retrievedDocs = await vectorStore.similaritySearch(
    `Certificate validation context for: ${queryText}`,
    8
  );

  // 2) Let the LLM perform validation using the retrieved context + criteria.
  const validationPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an advanced Certificate Validation Agent.

You receive:
- Retrieved certificate content chunks from a vector database (Pinecone).
- A structured JSON object of evaluation criteria (may be empty or partial).
- A natural-language description of how the user wants the certificate to be validated.

Your job:
- Carefully read the provided certificate content (context).
- Interpret the user's criteria (both structured JSON and natural language).
- Decide whether the certificate satisfies those criteria.

Output format:
Return ONLY valid JSON with the following shape:
{{
  "passed": boolean,
  "summary": string,
  "checks": [
    {{
      "criterion": string,
      "expected": string,
      "found": string,
      "passed": boolean
    }}
  ]
}}

Guidelines:
- Be honest about uncertainty – if information is missing, mark the relevant check as passed=false and explain in "found".
- You are NOT limited to specific hard-coded fields; you can validate any business rule the user describes.
- Do NOT use external knowledge; rely only on the provided context.`
    ],
    [
      "human",
      `Certificate context (from vector DB):
{context}

Structured criteria (JSON):
{structuredCriteria}

Criteria description (natural language):
{criteriaDescription}`
    ]
  ]);

  const chain = validationPrompt.pipe(llm);

  let validationJson;
  try {
    const validationResponse = await chain.invoke({
      context: retrievedDocs.map((d) => d.pageContent).join("\n\n---\n\n"),
      structuredCriteria: JSON.stringify(criteria || {}, null, 2),
      criteriaDescription: criteriaDescription || "",
    });

    const raw = (validationResponse.content || "").trim();
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    validationJson = JSON.parse(cleaned);
  } catch (error) {
    console.error("Error during LLM-based validation:", error);
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content:
            "I encountered an error while validating the certificate with your criteria. Please try again or refine your criteria."
        }
      ]
    };
  }

  return {
    ...state,
    extractedFields: null, // no longer used in this generic flow
    validationResult: validationJson,
    status: STATUS.VALIDATED
  };
}
