

const mysql = require('mysql2/promise');
const { QdrantClient } = require('@qdrant/js-client-rest');
async function embedText(text) {
  if (!global.embedder) {
    // Dynamic import to handle ESM-only package in CommonJS
    const TransformersApi = Function(
      'return import("@xenova/transformers")'
    )();
    const { pipeline } = await TransformersApi;
    global.embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  const output = await global.embedder(text, {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data);
}

const qdrant = new QdrantClient({ url: 'http://127.0.0.1:6333', checkCompatibility: false, // disable version check 
});

async function getMySQLJobs() {
    console.log('getcgh')
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Ashrith@26',
    database: 'thanjai_restaurant',
  });

  const [rows] = await conn.execute('select a.product_id, a.production_date, b.product_name  from thanjai_restaurant.prod_production_data a join thanjai_restaurant.product_master b on a.product_id=b.product_id');
  await conn.end();
  return rows;
}

async function embedText(text) {
  if (!global.embedder) {
    // Dynamically import the ESM-only package
    const TransformersApi = Function(
      'return import("@xenova/transformers")'
    )();
    const { pipeline } = await TransformersApi;
    global.embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }

  const output = await global.embedder(text, {
    pooling: 'mean',
    normalize: true
  });
  return Array.from(output.data);
}

async function ensureQdrantCollection() {
  const collections = await qdrant.getCollections();
  if (!collections.collections.find(c => c.name === 'jobs')) {
    await qdrant.createCollection('jobs', {
      vectors: { size: 384, distance: 'Cosine' },
    });
  }
}

async function importJobsToQdrant() {
  await ensureQdrantCollection();

  const jobs1 = await getMySQLJobs();
 

  const jobs = jobs1.map((item, index) => ({
  ...item,
  id: index + 1
}));

 console.log(jobs)

  for (const job of jobs) {
    const textToEmbed = `Produced: ${job.product_name} on ${job.production_date}`;
    const embedding = await embedText(textToEmbed);
    await qdrant.upsert('jobs', {
      points: [{
        id: job.id,
        vector: embedding,
        payload: {
          job_text: job.product_name,
          job_date: job.production_date,
          product_id:job.product_id
        },
      }],
    });
    console.log(`Imported job #${job.product_id}`);
  }

  console.log('✅ Done importing all jobs to Qdrant.');
}



importJobsToQdrant();
