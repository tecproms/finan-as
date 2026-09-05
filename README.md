# 💰 FinControl Pro - Sistema Financeiro PWA Mobile-First

Sistema moderno de gestão financeira pessoal e empresarial, com foco em dispositivos móveis, controle de receitas/despesas, agenda de compromissos com previsão de custos, bloco de anotações e assistente inteligente por chat e voz (NLP Offline + Groq API).

---

## 🚀 Como Iniciar o Sistema

### Opção 1: Inicialização em 1 Clique (Recomendado)
- Dê um duplo clique no arquivo **`iniciar-sistema.bat`**.
- O servidor local será iniciado e abrirá automaticamente no seu navegador padrão (`http://localhost:8080`).
- No terminal será exibido o endereço para acessar pelo celular conectado no mesmo Wi-Fi (ex: `http://192.168.1.73:8080`).

### Opção 2: Abrir diretamente no Navegador
- Se preferir não rodar o servidor, você pode abrir diretamente o arquivo **`index.html`** em qualquer navegador moderno (Google Chrome, Microsoft Edge, Safari, Opera).

---

## 📱 Como Usar e Instalar no Celular (PWA)

1. Com o computador e celular na mesma rede Wi-Fi, abra o sistema no computador e clique no ícone de **Celular (Smartphone)** no canto superior direito para exibir o **QR Code**.
2. Aponte a câmera do seu celular para o QR Code para abrir o link.
3. Para instalar como aplicativo nativo no celular:
   - **No iPhone / iPad (Safari):** Toque no botão de **Compartilhar** (quadrado com seta para cima) e escolha **"Adicionar à Tela de Início"**.
   - **No Android (Google Chrome):** Toque no menu de 3 pontinhos (**⋮**) no canto superior direito e escolha **"Instalar Aplicativo"** ou **"Adicionar à tela inicial"**.
4. O app será instalado com ícone próprio na sua tela inicial e funcionará em tela cheia com navegação rápida e suporte offline!

---

## 🤖 Configuração da Inteligência Artificial (API do Groq)

O FinControl Pro conta com dois motores de IA:
1. **Motor Local Offline (Gratuito e Integrado):** Funciona sem precisar de internet ou chaves, reconhecendo comandos em português brasileiro como:
   - *"Gastei 45 no almoço hoje no cartão"*
   - *"Recebi 3500 do salário via pix"*
   - *"Dentista amanhã às 14:30"*
   - *"Anotar comprar novo monitor"*
   - *"Qual o meu saldo atual?"*
   - *"Quanto gastei este mês?"*

2. **Integração com a API do Groq (IA Generativa Avançada):**
   - Para ativar o modelo **Llama 3.3 70B** do Groq:
     1. Abra o FinControl Pro.
     2. Clique no ícone de **Configurações (Engrenagem)** no topo.
     3. Cole sua chave no campo **Chave da API Groq** (obtida gratuitamente em [console.groq.com/keys](https://console.groq.com/keys)).
     4. Clique em **Testar Conexão** e depois em **Salvar Configurações**.
   - A partir desse momento, o chat utilizará o modelo do Groq para entender qualquer pedido complexo, dar consultoria financeira e categorizar lançamentos automaticamente!

---

## 🎙️ Lançamentos por Voz

- No menu inferior, acesse a aba **Chat IA**.
- Toque no botão de **Microfone** ao lado da barra de texto.
- Fale naturalmente seu gasto ou compromisso (ex: *"Gastei 80 reais no mercado no débito"*).
- O sistema transcreverá sua fala e exibirá um card para você confirmar o lançamento com 1 toque!

---

## 📊 Principais Funcionalidades

- **Dashboard:** Visão consolidada de saldo atual, receitas, despesas, saldo previsto e gráficos de fluxo e categorias.
- **Finanças:** Extrato com filtros por tipo, status (pago/pendente), busca em tempo real e exportação para Excel (CSV).
- **Parcelamento Automático:** Cadastre compras parceladas (2x a 12x) e o sistema gera os lançamentos futuros automaticamente.
- **Agenda & Compromissos:** Calendário e linha do tempo com integração financeira (associa custos aos compromissos e permite lançar como despesa).
- **Anotações:** Bloco de notas rápido com tags coloridas, fixação de notas prioritárias e conversão de notas em lançamentos ou compromissos.
- **Backups e Segurança:** Backup completo em arquivo JSON e restauração com 1 clique.
