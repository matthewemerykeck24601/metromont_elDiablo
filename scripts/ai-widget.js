// Global AI Widget Component
// Reusable AI assistant interface for all El Diablo modules

console.log('AI Widget module loaded');

class AIWidget {
  constructor(options = {}) {
    this.options = {
      endpoint: '/api/ai',
      fabPosition: options.fabPosition || 'bottom-right',
      moduleContext: options.moduleContext || null,
      folderContext: options.folderContext || null,
      ...options
    };
    
    this.isOpen = false;
    this.conversationHistory = [];
    this.isProcessing = false;
    
    this.render();
    this.attachEventListeners();
    
    console.log('✅ AI Widget initialized for module:', this.options.moduleContext);
  }
  
  render() {
    // Check if widget already exists
    if (document.getElementById('aiWidgetContainer')) {
      console.log('AI Widget already exists');
      return;
    }
    
    const container = document.createElement('div');
    container.id = 'aiWidgetContainer';
    container.className = 'ai-widget-container';
    
    const positionClass = `ai-fab-${this.options.fabPosition}`;
    
    container.innerHTML = `
      <!-- Floating Action Button -->
      <button id="aiFab" class="ai-fab ${positionClass}" aria-label="Open AI Assistant" title="AI Assistant">
        <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
        <span class="ai-fab-badge" style="display:none;">✨</span>
      </button>
      
      <!-- AI Modal -->
      <div id="aiModal" class="ai-modal" aria-hidden="true">
        <div class="ai-modal-backdrop"></div>
        <div class="ai-modal-panel">
          <div class="ai-modal-header">
            <div class="ai-modal-title">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              <h3>El Diablo AI Assistant</h3>
            </div>
            <div class="ai-modal-actions">
              <button id="aiClearBtn" class="ai-btn-icon" title="Clear conversation">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
              <button id="aiCloseBtn" class="ai-btn-icon" title="Close">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>
          
          ${this.options.moduleContext ? `
          <div class="ai-context-bar">
            <span class="ai-context-label">Module:</span>
            <span class="ai-context-value">${this.formatModuleName(this.options.moduleContext)}</span>
            ${this.options.folderContext ? `
              <span class="ai-context-sep">•</span>
              <span class="ai-context-label">Folder:</span>
              <span class="ai-context-value">${this.options.folderContext}</span>
            ` : ''}
          </div>
          ` : ''}
          
          <div id="aiChatContainer" class="ai-chat-container">
            <div class="ai-welcome">
              <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="opacity: 0.3;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              <h4>How can I help you today?</h4>
              <div class="ai-suggestions">
                <button class="ai-suggestion" data-prompt="Create the assets table">Create assets table</button>
                <button class="ai-suggestion" data-prompt="Show me what tables exist">List tables</button>
                <button class="ai-suggestion" data-prompt="Add 3 test rows to companies">Add test data</button>
              </div>
            </div>
          </div>
          
          <div class="ai-input-container">
            <textarea 
              id="aiInput" 
              class="ai-input" 
              placeholder="Ask me to create tables, import data, manage permissions..."
              rows="1"
            ></textarea>
            <button id="aiSendBtn" class="ai-send-btn" disabled title="Send message">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          
          <div class="ai-footer">
            <span class="ai-footer-text">Powered by GPT-4 • Admin access required</span>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(container);
  }
  
  attachEventListeners() {
    const fab = document.getElementById('aiFab');
    const modal = document.getElementById('aiModal');
    const closeBtn = document.getElementById('aiCloseBtn');
    const clearBtn = document.getElementById('aiClearBtn');
    const backdrop = modal.querySelector('.ai-modal-backdrop');
    const input = document.getElementById('aiInput');
    const sendBtn = document.getElementById('aiSendBtn');
    
    // FAB click
    fab.addEventListener('click', () => this.toggle());
    
    // Close button
    closeBtn.addEventListener('click', () => this.close());
    
    // Clear button
    clearBtn.addEventListener('click', () => this.clearConversation());
    
    // Backdrop click
    backdrop.addEventListener('click', () => this.close());
    
    // Input handling
    input.addEventListener('input', () => {
      sendBtn.disabled = !input.value.trim();
      this.autoResize(input);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) {
          this.sendMessage(input.value.trim());
        }
      }
    });
    
    // Send button
    sendBtn.addEventListener('click', () => {
      if (input.value.trim()) {
        this.sendMessage(input.value.trim());
      }
    });
    
    // Suggestion buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('ai-suggestion')) {
        const prompt = e.target.dataset.prompt;
        this.sendMessage(prompt);
      }
    });
    
    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }
  
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  open() {
    const modal = document.getElementById('aiModal');
    const input = document.getElementById('aiInput');
    
    modal.setAttribute('aria-hidden', 'false');
    this.isOpen = true;
    
    // Focus input after animation
    setTimeout(() => input.focus(), 100);
  }
  
  close() {
    const modal = document.getElementById('aiModal');
    
    modal.setAttribute('aria-hidden', 'true');
    this.isOpen = false;
  }
  
  async sendMessage(text) {
    if (this.isProcessing) return;
    
    const input = document.getElementById('aiInput');
    const sendBtn = document.getElementById('aiSendBtn');
    const container = document.getElementById('aiChatContainer');
    
    // Hide welcome message
    const welcome = container.querySelector('.ai-welcome');
    if (welcome) welcome.style.display = 'none';
    
    // Add user message
    this.addMessage('user', text);
    
    // Clear input
    input.value = '';
    sendBtn.disabled = true;
    this.autoResize(input);
    
    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: text });
    
    // Show loading
    const loadingId = this.addMessage('assistant', 'Thinking...', true);
    this.isProcessing = true;
    
    try {
      // Get identity header
      const identityHeader = window.getIdentityHeader ? window.getIdentityHeader() : null;
      
      if (!identityHeader) {
        throw new Error('Not authenticated. Please sign in first.');
      }
      
      // Call AI endpoint with robust error handling
      let data;
      try {
        const response = await fetch(this.options.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-netlify-identity': identityHeader
          },
          body: JSON.stringify({
            messages: this.conversationHistory,
            context: {
              module: this.options.moduleContext,
              folder: this.options.folderContext
            }
          })
        });
        
        // Read response as text first
        const rawText = await response.text();
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        
        // Check if response is OK
        if (!response.ok) {
          // Try to parse as JSON for structured error
          if (contentType.includes('application/json')) {
            try {
              const errorData = JSON.parse(rawText);
              throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
            } catch (parseErr) {
              throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 200)}`);
            }
          } else {
            // HTML error page from platform
            throw new Error(`Server error (${response.status}): Platform issue or edge function not deployed. Check Netlify dashboard.`);
          }
        }
        
        // Verify JSON response
        if (!contentType.includes('application/json')) {
          throw new Error(`Expected JSON but got ${contentType}`);
        }
        
        // Parse JSON
        data = JSON.parse(rawText);
        
      } catch (fetchError) {
        this.removeMessage(loadingId);
        throw fetchError;
      }
      
      // Remove loading message
      this.removeMessage(loadingId);
      
      // Handle clarification requests
      if (data.requiresClarification) {
        this.addMessage('assistant', data.question);
        this.conversationHistory.push({ role: 'assistant', content: data.question });
      } else {
        // Format success response
        const resultText = this.formatResult(data);
        this.addMessage('assistant', resultText);
        this.conversationHistory.push({ role: 'assistant', content: resultText });
        
        // Show success badge on FAB
        this.showSuccessBadge();
        
        // Trigger reload if callback provided
        if (this.options.onSuccess && typeof this.options.onSuccess === 'function') {
          this.options.onSuccess(data);
        }
      }
      
    } catch (error) {
      console.error('AI request failed:', error);
      
      // Remove loading message
      this.removeMessage(loadingId);
      
      // Show error
      this.addMessage('assistant', `❌ Error: ${error.message}`, false, true);
    } finally {
      this.isProcessing = false;
    }
  }
  
  addMessage(role, content, isLoading = false, isError = false) {
    const container = document.getElementById('aiChatContainer');
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `ai-message ai-message-${role}`;
    if (isLoading) messageDiv.classList.add('ai-message-loading');
    if (isError) messageDiv.classList.add('ai-message-error');
    
    const avatar = role === 'user' ? '👤' : '🤖';
    
    messageDiv.innerHTML = `
      <div class="ai-message-avatar">${avatar}</div>
      <div class="ai-message-content">
        ${isLoading ? '<div class="ai-loading-dots"><span></span><span></span><span></span></div>' : this.formatMessageContent(content)}
      </div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    
    return messageId;
  }
  
  removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
      message.remove();
    }
  }
  
  formatMessageContent(content) {
    // Convert markdown-like formatting
    let formatted = this.escapeHtml(content);
    
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Code blocks
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }
  
  formatResult(data) {
    if (!data.result) return 'Action completed successfully.';
    
    const result = data.result;
    let message = '';
    
    if (result.message) {
      message = result.message;
    } else if (result.tableId) {
      message = `Table **${result.tableId}** ${result.exists ? 'already exists' : 'created successfully'}.`;
    } else if (result.written) {
      message = `Successfully inserted **${result.written} row(s)**.`;
    } else {
      message = 'Action completed successfully.';
    }
    
    // Add action details
    if (data.action) {
      message += `\n\n_Action: \`${data.action}\`_`;
    }
    
    return message;
  }
  
  clearConversation() {
    const container = document.getElementById('aiChatContainer');
    const welcome = container.querySelector('.ai-welcome');
    
    // Remove all messages
    const messages = container.querySelectorAll('.ai-message');
    messages.forEach(msg => msg.remove());
    
    // Show welcome message
    if (welcome) {
      welcome.style.display = 'block';
    }
    
    // Clear history
    this.conversationHistory = [];
    
    console.log('Conversation cleared');
  }
  
  showSuccessBadge() {
    const badge = document.querySelector('.ai-fab-badge');
    if (badge) {
      badge.style.display = 'block';
      setTimeout(() => {
        badge.style.display = 'none';
      }, 3000);
    }
  }
  
  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }
  
  formatModuleName(module) {
    const names = {
      'db-manager': 'DB Manager',
      'quality': 'Quality Control',
      'design': 'Engineering',
      'production': 'Production Scheduling',
      'admin': 'Admin',
      'erection-sequencing': 'Erection Sequencing'
    };
    return names[module] || module;
  }
  
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  // Public API
  setModuleContext(module) {
    this.options.moduleContext = module;
  }
  
  setFolderContext(folder) {
    this.options.folderContext = folder;
  }
  
  showMessage(text) {
    this.open();
    setTimeout(() => {
      this.addMessage('assistant', text);
    }, 300);
  }
}

// Make AIWidget globally available
window.AIWidget = AIWidget;

console.log('✅ AI Widget system ready');

