#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

function execCommand(command, description, { allowFailure = false } = {}) {
  console.log(`\n🔄 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed`);
  } catch (error) {
    if (allowFailure) {
      console.warn(`⚠️  ${description} skipped: ${error.message}`);
      return;
    }
    console.error(`❌ ${description} failed:`, error.message);
    process.exit(1);
  }
}

function removeIfExists(varNameUpper, target) {
  execCommand(
    `vercel env rm ${varNameUpper} ${target} -y`,
    `Removing ${varNameUpper} from ${target} if exists`,
    { allowFailure: true }
  );
}

async function setupVercelEnv() {
  console.log('🔧 Setting up Vercel environment variables...\n');

  // Check if .env file exists
  if (!existsSync('.env')) {
    console.log('⚠️  No .env file found. Please create one with your environment variables');
    console.log('   Required: OPENAI_API_KEY');
    console.log('   Optional: OPENAI_MODEL, OPENAI_BASE_URL');
    process.exit(1);
  }

  const requiredVars = ['OPENAI_API_KEY'];
  const optionalVars = ['OPENAI_MODEL', 'OPENAI_BASE_URL'];

  // Set required environment variables (idempotent)
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      console.error(`❌ Required environment variable ${varName} is not set in .env file`);
      process.exit(1);
    }
    
    // Use uppercase variable names as they are referenced in code (process.env.OPENAI_API_KEY)
    const secretName = varName; // keep original uppercase
    const clean = String(value).trim().replace(/^['\"]|['\"]$/g, '');
    removeIfExists(secretName, 'production');
    execCommand(
      `printf %s "${clean}" | vercel env add ${secretName} production`,
      `Setting ${varName} for production`
    );
    
    removeIfExists(secretName, 'preview');
    execCommand(
      `printf %s "${clean}" | vercel env add ${secretName} preview`,
      `Setting ${varName} for preview`
    );
  }

  // Set optional environment variables (idempotent)
  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value) {
      const secretName = varName; // keep original uppercase
      const cleanOpt = String(value).trim().replace(/^['\"]|['\"]$/g, '');
      removeIfExists(secretName, 'production');
      execCommand(
        `printf %s "${cleanOpt}" | vercel env add ${secretName} production`,
        `Setting ${varName} for production`
      );
      
      removeIfExists(secretName, 'preview');
      execCommand(
        `printf %s "${cleanOpt}" | vercel env add ${secretName} preview`,
        `Setting ${varName} for preview`
      );
    }
  }

  console.log('\n🎉 Vercel environment setup completed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Test locally: npm run vercel:dev');
  console.log('   2. Deploy: npm run vercel:deploy');
}

setupVercelEnv().catch(console.error);
