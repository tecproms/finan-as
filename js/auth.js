// Módulo de Segurança e Autenticação (SHA-256 + Salt) - FinControl Pro

class AuthModule {
  constructor() {
    this.isLocked = false;
    this.currentPinInput = '';
    this.inactivityTimer = null;
    this.lastActivityTime = Date.now();
    this.init();
  }

  init() {
    const authConfig = this.getAuthConfig();
    // Se a autenticação estiver ativada, o app inicia bloqueado por padrão
    if (authConfig.enabled) {
      this.isLocked = true;
    }
    this.setupInactivityListener();
  }

  getAuthConfig() {
    const settings = window.db ? window.db.getSettings() : {};
    return settings.auth || {
      enabled: false,
      hash: '',
      salt: '',
      pinLength: 4,
      autoLockMinutes: 5
    };
  }

  saveAuthConfig(newConfig) {
    const settings = window.db.getSettings();
    const merged = { ...this.getAuthConfig(), ...newConfig };
    window.db.setSettings({ auth: merged });
    return merged;
  }

  // Gera hash criptográfico SHA-256 com Salt
  async hashPassword(password, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(password + '::' + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Gera Salt criptográfico aleatório
  generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Cadastra ou altera o PIN de segurança
  async setSecurityPin(pin, autoLockMinutes = 5) {
    const cleanPin = String(pin).trim();
    if (!cleanPin || cleanPin.length < 4) {
      throw new Error('O PIN deve ter no mínimo 4 dígitos.');
    }

    const salt = this.generateSalt();
    const hash = await this.hashPassword(cleanPin, salt);

    this.saveAuthConfig({
      enabled: true,
      hash: hash,
      salt: salt,
      pinLength: cleanPin.length,
      autoLockMinutes: parseInt(autoLockMinutes) || 5
    });

    this.isLocked = false;
    this.resetActivity();
    return true;
  }

  // Desativa a proteção por senha
  async disableAuth(currentPin) {
    const isValid = await this.verifyPin(currentPin);
    if (!isValid) {
      throw new Error('PIN atual incorreto.');
    }

    this.saveAuthConfig({
      enabled: false,
      hash: '',
      salt: ''
    });

    this.isLocked = false;
    return true;
  }

  // Valida o PIN inserido
  async verifyPin(pin) {
    const config = this.getAuthConfig();
    if (!config.enabled) return true;

    const testHash = await this.hashPassword(String(pin).trim(), config.salt);
    return testHash === config.hash;
  }

  // Desbloqueia o sistema
  async attemptUnlock(pin) {
    const isValid = await this.verifyPin(pin);
    if (isValid) {
      this.isLocked = false;
      this.currentPinInput = '';
      this.resetActivity();
      this.updateLockUI();
      if (window.confetti) {
        window.confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
      }
      return true;
    }
    return false;
  }

  // Bloqueia o sistema imediatamente
  lock() {
    const config = this.getAuthConfig();
    if (config.enabled) {
      this.isLocked = true;
      this.currentPinInput = '';
      this.updateLockUI();
    }
  }

  // Escuta atividade do usuário para auto-bloqueio por inatividade
  setupInactivityListener() {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => {
      window.addEventListener(evt, () => this.resetActivity(), { passive: true });
    });

    // Checa a cada 30 segundos se passou o tempo limite
    setInterval(() => {
      const config = this.getAuthConfig();
      if (config.enabled && !this.isLocked && config.autoLockMinutes > 0) {
        const elapsedMinutes = (Date.now() - this.lastActivityTime) / 60000;
        if (elapsedMinutes >= config.autoLockMinutes) {
          this.lock();
        }
      }
    }, 30000);
  }

  resetActivity() {
    this.lastActivityTime = Date.now();
  }

  // Atualiza a exibição da tela de bloqueio
  updateLockUI() {
    const screen = document.getElementById('lock-screen-overlay');
    const lockBtn = document.getElementById('btn-quick-lock');

    if (screen) {
      if (this.isLocked && this.getAuthConfig().enabled) {
        screen.classList.remove('hidden');
        this.renderPinDots();
      } else {
        screen.classList.add('hidden');
      }
    }

    if (lockBtn) {
      const isEnabled = this.getAuthConfig().enabled;
      if (isEnabled) {
        lockBtn.classList.remove('hidden');
        lockBtn.innerHTML = this.isLocked 
          ? '<i data-lucide="lock" class="w-4 h-4 text-rose-400"></i>' 
          : '<i data-lucide="lock-open" class="w-4 h-4 text-emerald-400"></i>';
      } else {
        lockBtn.classList.add('hidden');
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // Renderiza os pontos de preenchimento do PIN (Dots)
  renderPinDots() {
    const config = this.getAuthConfig();
    const maxLen = config.pinLength || 4;
    const dotsContainer = document.getElementById('lock-pin-dots');
    if (!dotsContainer) return;

    let html = '';
    for (let i = 0; i < maxLen; i++) {
      const filled = i < this.currentPinInput.length;
      html += `
        <div class="w-4 h-4 rounded-full transition-all duration-200 ${
          filled 
            ? 'bg-emerald-400 scale-110 shadow-sm shadow-emerald-400/50' 
            : 'bg-slate-700/80 border border-slate-600'
        }"></div>
      `;
    }
    dotsContainer.innerHTML = html;
  }

  // Processa clique nos botões numéricos
  async handleKeypadPress(digit) {
    const config = this.getAuthConfig();
    const maxLen = config.pinLength || 4;

    if (digit === 'clear') {
      this.currentPinInput = '';
      this.renderPinDots();
      return;
    }

    if (digit === 'backspace') {
      this.currentPinInput = this.currentPinInput.slice(0, -1);
      this.renderPinDots();
      return;
    }

    if (this.currentPinInput.length < maxLen) {
      this.currentPinInput += digit;
      this.renderPinDots();

      // Quando atinge o tamanho do PIN, testa automaticamente
      if (this.currentPinInput.length === maxLen) {
        const ok = await this.attemptUnlock(this.currentPinInput);
        if (!ok) {
          this.triggerErrorAnimation();
          this.currentPinInput = '';
          setTimeout(() => this.renderPinDots(), 400);
        }
      }
    }
  }

  // Animação de tremor ao errar o PIN
  triggerErrorAnimation() {
    const container = document.getElementById('lock-card-box');
    const msg = document.getElementById('lock-error-msg');
    if (container) {
      container.classList.add('shake-error');
      setTimeout(() => container.classList.remove('shake-error'), 400);
    }
    if (msg) {
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2500);
    }
  }
}

window.auth = new AuthModule();
