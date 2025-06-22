require('dotenv').config();
const { QdrantClient } = require('@qdrant/js-client-rest');
const fetch = require('node-fetch');

// Initialize Qdrant client (adjust if you already have one)
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

// Lazy loading embedder using @xenova/transformers
let embedder = null;
async function getEmbedder() {
  if (!embedder) {
    const TransformersApi = Function('return import("@xenova/transformers")')();
    const { pipeline } = await TransformersApi;
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

async function embedText(text) {
  const embed = await getEmbedder();
  const output = await embed(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function searchQdrant(embedding, topK = 5) {
  const results = await qdrant.search('jobs', {
    vector: embedding,
    top: topK,
    with_payload: true,
  });
  return results.map(r => r.payload);
}

async function askOpenRouter(contextJobs, question) {
  const contextText = contextJobs
    .map(j => `• ${j.job_text} (Date: ${j.job_date})`)
    .join('\n');

  const prompt = `You are an expert restaurant production assistant.\n\nContext:\n${contextText}\n\nQuestion: ${question}\nAnswer:`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct', // or your preferred free-tier model
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
