#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

function execCommand(command, description, exitOnFail = true) {
  console.log(`\n🔄 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    if (exitOnFail) {
      process.exit(1);
    }
    return false;
  }
}

async function deployToFirebase() {
  console.log('🚀 Starting Firebase deployment...\n');

  // Check if .env file exists
  if (!existsSync('.env')) {
    console.log('⚠️  No .env file found. Please create one based on env.example');
    console.log('   Copy env.example to .env and fill in your values');
    process.exit(1);
  }

  // 1. Set Firebase secrets from .env file
  console.log('🔐 Setting up Firebase secrets...');
  
  const requiredSecrets = [
    'OPENAI_API_KEY'
  ];

  const optionalSecrets = [
    'OPENAI_MODEL',
    'OPENAI_BASE_URL',
    'OPENROUTER_SITE_URL',
    'OPENROUTER_APP_TITLE'
  ];

  // Try to use secrets first, fall back to config if it fails
  console.log('🔧 Trying modern secrets approach...');
  
  let secretsWorked = true;
  
  // Test if secrets work by trying the first required secret
  const testSecret = requiredSecrets[0];
  const testValue = process.env[testSecret];
  if (!testValue) {
    console.error(`❌ Required environment variable ${testSecret} is not set in .env file`);
    process.exit(1);
  }
  
  const secretTestWorked = execCommand(
    `echo "${testValue}" | firebase functions:secrets:set ${testSecret}`,
    `Testing secrets with ${testSecret}`,
    false // Don't exit on fail
  );
  
  if (secretTestWorked) {
    console.log('✅ Secrets approach works, setting remaining secrets...');
    
    // Set remaining required secrets
    for (let i = 1; i < requiredSecrets.length; i++) {
      const secret = requiredSecrets[i];
      const value = process.env[secret];
      if (!value) {
        console.error(`❌ Required environment variable ${secret} is not set in .env file`);
        process.exit(1);
      }
      execCommand(
        `echo "${value}" | firebase functions:secrets:set ${secret}`,
        `Setting secret ${secret}`
      );
    }

    // Set optional secrets (only if they exist)
    for (const secret of optionalSecrets) {
      const value = process.env[secret];
      if (value) {
        execCommand(
          `echo "${value}" | firebase functions:secrets:set ${secret}`,
          `Setting secret ${secret}`
        );
      }
    }
    console.log('✅ Using modern secrets approach');
  } else {
    console.log('⚠️  Secrets not available, falling back to traditional config...');
    
    // Fallback to traditional config
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    if (!openaiKey) {
      console.error('❌ OPENAI_API_KEY is required');
      process.exit(1);
    }
    
    execCommand(
      `firebase functions:config:set openai.key="${openaiKey}" openai.model="${openaiModel}" openai.base_url="${openaiBaseUrl}"`,
      'Setting Firebase config'
    );
    
    console.log('✅ Using traditional config approach');
  }

  // 2. Install function dependencies
  execCommand(
    'cd functions && npm install',
    'Installing function dependencies'
  );

  // 3. Build frontend
  execCommand(
    'npm run build',
    'Building frontend'
  );

  // 4. Deploy everything
  execCommand(
    'firebase deploy',
    'Deploying to Firebase'
  );

  console.log('\n🎉 Deployment completed successfully!');
  console.log('\n📱 Your app is now live at:');
  
  // Try to get project ID from .firebaserc
  try {
    const firebaserc = JSON.parse(readFileSync('.firebaserc', 'utf8'));
    const projectId = firebaserc.projects.default;
    console.log(`   Frontend: https://${projectId}.web.app`);
    console.log(`   API: https://us-central1-${projectId}.cloudfunctions.net/api`);
  } catch (error) {
    console.log('   Check Firebase console for your app URLs');
  }
}

deployToFirebase().catch(console.error);
