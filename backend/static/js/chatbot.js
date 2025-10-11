document.addEventListener('DOMContentLoaded', ()=>{
  const form = document.getElementById('chat-form');
  const input = document.getElementById('input');
  const messages = document.getElementById('messages');

  function appendMessage(text, cls){
    const d = document.createElement('div');
    d.className = `msg ${cls}`;
    d.textContent = text;
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
  }

  // Initial bot greeting
  appendMessage('Hello! Ask me about all your previous memories and experiences.', 'bot');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = input.value.trim();
    if(!text) return;
    appendMessage(text, 'user');
    input.value = '';

    appendMessage('...', 'bot');
    const placeholder = messages.querySelector('.msg.bot:last-child');

    try{
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({message: text})
      });
      if(!res.ok) throw new Error('Network error');
      const data = await res.json();
      placeholder.textContent = data.reply;
    }catch(err){
      placeholder.textContent = 'Sorry, something went wrong. Try again later.';
      console.error(err);
    }
  });
});
