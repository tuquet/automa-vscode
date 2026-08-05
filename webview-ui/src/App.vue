<script setup lang="ts">
import { vscode } from './vscode'

function installBrowser() {
  vscode.postMessage({
    command: 'installBrowser'
  })
}
</script>

<template>
  <div class="welcome-container">
    <header class="header">
      <img src="./assets/logo.jpg" alt="Automa Logo" class="logo" />
      <h1>Welcome to Automa CLI Toolkit</h1>
    </header>

    <div class="banner">
      <img src="./assets/banner.jpg" alt="Automa Banner" />
    </div>

    <main class="content">
      <p>Your centralized command center for browser automation fleets.</p>
      
      <div class="action-card">
        <h3>🚀 First Step: Setup Runtime</h3>
        <p>Automa runs your workflows in an isolated Chromium browser to avoid detection and ensure stability. You need to install it before running any fleets.</p>
        <button @click="installBrowser" class="primary-button">
          Install Isolated Chromium
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.welcome-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--vscode-font-family);
  color: var(--vscode-editor-foreground);
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.logo {
  width: 100px;
  height: 100px;
  border-radius: 12px;
  margin-bottom: 1rem;
}

h1 {
  font-size: 2rem;
  color: var(--vscode-editor-foreground);
  margin: 0;
}

.banner img {
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.content {
  margin-top: 2rem;
  text-align: center;
  width: 100%;
}

.action-card {
  background: var(--vscode-editor-inactiveSelectionBackground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  padding: 2rem;
  margin-top: 2rem;
}

.action-card h3 {
  margin-top: 0;
  color: var(--vscode-textLink-foreground);
}

.primary-button {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 10px 20px;
  font-size: 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 1rem;
  font-weight: bold;
}

.primary-button:hover {
  background: var(--vscode-button-hoverBackground);
}
</style>
