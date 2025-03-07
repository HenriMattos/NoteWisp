// Variáveis globais
let isTyping = false;
const editor = document.getElementById('editor');
const saveStatus = document.getElementById('saveStatus');
const modal = document.getElementById('customModal');
const linkMenu = document.getElementById('linkMenu');
let modalCallback = null;
let activeLink = null;

// Gerenciamento de tema
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-theme', savedTheme === 'dark');
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    const theme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// Função de debounce para otimização
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Histórico de alterações
const history = {
    changes: [],
    maxSize: 50,
    
    add(content) {
        this.changes.push(content);
        if (this.changes.length > this.maxSize) {
            this.changes.shift();
        }
        localStorage.setItem('editorHistory', JSON.stringify(this.changes));
    },
    
    load() {
        try {
            const saved = localStorage.getItem('editorHistory');
            if (saved) {
                this.changes = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        }
    }
};

// Função auxiliar para verificar seleção válida
function getValidSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range || !editor.contains(range.commonAncestorContainer)) return null;
    return { selection, range };
}

// Sanitizar HTML
function sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    
    // Remover scripts e elementos perigosos
    const dangerous = div.querySelectorAll('script, iframe, object, embed, form');
    dangerous.forEach(el => el.remove());
    
    // Limpar atributos perigosos
    const all = div.getElementsByTagName('*');
    for (const el of all) {
        for (const attr of el.attributes) {
            if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
                el.removeAttribute(attr.name);
            }
        }
    }
    
    return div.innerHTML;
}

// Sanitizar URLs
function sanitizeUrl(url) {
    try {
        const parsed = new URL(url);
        const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
        if (!allowedProtocols.includes(parsed.protocol)) {
            throw new Error('Protocolo não permitido');
        }
        return parsed.href;
    } catch {
        return null;
    }
}

// Atalhos de teclado aprimorados
document.addEventListener('keydown', function(e) {
    if (!editor.contains(document.activeElement)) return;
    
    if (e.ctrlKey) {
        switch(e.key.toLowerCase()) {
            case 'b':
                e.preventDefault();
                formatText('bold');
                break;
            case 'i':
                e.preventDefault();
                formatText('italic');
                break;
            case 'u':
                e.preventDefault();
                formatText('underline');
                break;
            case 'k':
                e.preventDefault();
                addLink();
                break;
            case 'z':
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                break;
            case 'y':
                e.preventDefault();
                redo();
                break;
            case 's':
                e.preventDefault();
                forceSync();
                break;
            case 'f':
                e.preventDefault();
                searchInText();
                break;
        }
    }
    
    // Tab dentro do bloco de código
    if (e.key === 'Tab' && isInsideCodeBlock(e.target)) {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
    }
    
    // Enter em listas
    if (e.key === 'Enter' && !e.shiftKey) {
        const selection = window.getSelection();
        const node = selection.anchorNode;
        if (node) {
            const listItem = node.closest('li');
            if (listItem && listItem.textContent.trim() === '') {
                e.preventDefault();
                const list = listItem.parentNode;
                listItem.remove();
                if (list.children.length === 0) {
                    list.remove();
                }
                document.execCommand('insertParagraph');
            }
        }
    }
});

// Função para buscar texto
function searchInText() {
    const searchTerm = prompt('Digite o texto para buscar:');
    if (!searchTerm) return;

    const text = editor.textContent;
    const regex = new RegExp(searchTerm, 'gi');
    const matches = [...text.matchAll(regex)];
    
    if (matches.length > 0) {
        alert(`Encontrados ${matches.length} resultados para "${searchTerm}"`);
    } else {
        alert('Nenhum resultado encontrado.');
    }
}

// Função para forçar sincronização
function forceSync() {
    try {
        const content = editor.innerHTML;
        localStorage.setItem('editorContent', content);
        history.add(content);
        lastSavedContent = content;
        saveStatus.textContent = 'Salvo';
        saveStatus.classList.remove('saving');
        alert('Conteúdo salvo com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar o conteúdo.');
    }
}

// Suporte para drag and drop
editor.addEventListener('dragover', e => e.preventDefault());
editor.addEventListener('drop', function(e) {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    const selection = window.getSelection();
    if (selection.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
    }
});

// Sanitizar colagem
editor.addEventListener('paste', function(e) {
    e.preventDefault();
    let content = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
    
    if (e.clipboardData.types.includes('text/html')) {
        content = sanitizeHtml(content);
    }
    
    document.execCommand('insertHTML', false, content);
});

// Função para formatar texto
function formatText(command) {
    if (!editor.contains(document.activeElement)) {
        editor.focus();
    }
    document.execCommand(command, false, null);
    updateToolbarState();
    history.add(editor.innerHTML);
}

// Função para formatar títulos
function formatHeading() {
    const select = document.getElementById('headingSelect');
    const headingType = select.value;

    try {
        if (headingType) {
            document.execCommand('formatBlock', false, `<${headingType}>`);
        } else {
            document.execCommand('formatBlock', false, '<p>');
        }
    } catch (error) {
        console.error('Erro ao formatar título:', error);
    }

    updateWordCount();
}

// Atualizar estado da barra de ferramentas quando a seleção muda
editor.addEventListener('mouseup', function() {
    try {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let node = selection.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;

        const select = document.getElementById('headingSelect');
        const headingTags = ['h1', 'h2', 'h3', 'p'];
        
        while (node && node !== editor) {
            const tagName = node.tagName ? node.tagName.toLowerCase() : '';
            if (headingTags.includes(tagName)) {
                select.value = tagName === 'p' ? '' : tagName;
                break;
            }
            node = node.parentNode;
        }
    } catch (error) {
        console.error('Erro ao atualizar estado dos títulos:', error);
    }
});

// Função para criar listas
function createList(type) {
    if (!getValidSelection()) return;
    
    try {
        document.execCommand('insertUnorderedList', false, null);
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const list = range.commonAncestorContainer;
        
        if (list.nodeName === 'UL' && type === 'ol') {
            const newList = document.createElement('ol');
            Array.from(list.children).forEach(item => {
                newList.appendChild(item.cloneNode(true));
            });
            list.parentNode.replaceChild(newList, list);
        }
    } catch (error) {
        console.error('Erro ao criar lista:', error);
    }
    updateWordCount();
}

// Função para adicionar lista de verificação
function addCheckList() {
    const selectionData = getValidSelection();
    if (!selectionData) return;

    try {
        const { range } = selectionData;
        const selectedText = range.toString().trim();

        const checklistItem = document.createElement('div');
        checklistItem.className = 'checklist-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        
        const text = document.createElement('span');
        text.contentEditable = true;
        text.textContent = selectedText || 'Novo item';
        
        checklistItem.appendChild(checkbox);
        checklistItem.appendChild(text);
        
        range.deleteContents();
        range.insertNode(checklistItem);
    } catch (error) {
        console.error('Erro ao criar checklist:', error);
    }
    updateWordCount();
}

// Função para adicionar bloco de código
function addCodeBlock() {
    const selectionData = getValidSelection();
    if (!selectionData) return;

    try {
        const { range } = selectionData;
        const selectedText = range.toString().trim();

        const codeBlock = document.createElement('pre');
        codeBlock.className = 'code-block';
        codeBlock.contentEditable = true;
        codeBlock.setAttribute('data-placeholder', 'Digite seu código aqui');
        codeBlock.textContent = selectedText || '';
        
        range.deleteContents();
        range.insertNode(codeBlock);
        
        // Posicionar cursor dentro do bloco
        const selection = window.getSelection();
        const newRange = document.createRange();
        newRange.setStart(codeBlock, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        codeBlock.focus();
    } catch (error) {
        console.error('Erro ao criar bloco de código:', error);
    }
    updateWordCount();
}

// Função para adicionar citação
function addQuote() {
    const selectionData = getValidSelection();
    if (!selectionData) return;

    try {
        const { range } = selectionData;
        const selectedText = range.toString().trim();

        const quote = document.createElement('blockquote');
        quote.contentEditable = true;
        quote.setAttribute('data-placeholder', 'Digite sua citação aqui');
        quote.textContent = selectedText || '';
        
        range.deleteContents();
        range.insertNode(quote);
        
        // Posicionar cursor dentro da citação
        const selection = window.getSelection();
        const newRange = document.createRange();
        newRange.setStart(quote, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        quote.focus();
    } catch (error) {
        console.error('Erro ao criar citação:', error);
    }
    updateWordCount();
}

// Funções do Modal
function showModal(title, callback) {
    modal.classList.add('show');
    document.getElementById('modalTitle').textContent = title;
    modalCallback = callback;
    
    // Focar no primeiro input
    const firstInput = modal.querySelector('input');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }
}

function closeModal() {
    modal.classList.remove('show');
    modalCallback = null;
    // Limpar campos
    const inputs = modal.querySelectorAll('input');
    inputs.forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = true;
        } else {
            input.value = '';
        }
    });
}

function confirmModal() {
    if (modalCallback) {
        modalCallback();
    }
    closeModal();
}

// Fechar modal com Esc
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
        closeModal();
    }
});

// Função para adicionar link atualizada
function addLink() {
    const selectionData = getValidSelection();
    if (!selectionData) {
        alert('Selecione um texto para adicionar o link');
        return;
    }

    const { selection, range } = selectionData;
    const selectedText = range.toString().trim();
    
    // Preencher o campo de texto se houver seleção
    if (selectedText) {
        document.getElementById('linkText').value = selectedText;
    }
    
    showModal('Adicionar Link', function() {
        const url = document.getElementById('linkUrl').value;
        const text = document.getElementById('linkText').value;
        const newTab = document.getElementById('newTab').checked;
        
        if (!url) {
            alert('Por favor, insira uma URL válida');
            return;
        }
        
        const safeUrl = sanitizeUrl(url.trim());
        if (!safeUrl) {
            alert('URL inválida. Por favor, verifique e tente novamente.');
            return;
        }
        
        try {
            // Criar o link
            const link = document.createElement('a');
            link.href = safeUrl;
            link.textContent = text || safeUrl;
            if (newTab) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            
            // Inserir o link
            range.deleteContents();
            range.insertNode(link);
            
            // Atualizar histórico
            history.add(editor.innerHTML);
        } catch (error) {
            console.error('Erro ao criar link:', error);
            alert('Erro ao criar o link. Tente novamente.');
        }
    });
}

// Função para mudar cor do texto
function changeTextColor(color) {
    if (!editor.contains(document.activeElement)) {
        editor.focus();
    }
    document.execCommand('foreColor', false, color);
}

// Funções de desfazer/refazer
function undo() {
    try {
        document.execCommand('undo', false, null);
        updateWordCount();
        updateToolbarState();
    } catch (error) {
        console.error('Erro ao desfazer:', error);
    }
}

function redo() {
    try {
        document.execCommand('redo', false, null);
        updateWordCount();
        updateToolbarState();
    } catch (error) {
        console.error('Erro ao refazer:', error);
    }
}

// Função para exportar conteúdo
function exportContent(format) {
    try {
        let content = '';
        const title = 'Documento';
        const date = new Date().toLocaleDateString();
        
        if (format === 'html') {
            content = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
        pre { background: #f6f8fa; padding: 1rem; border-radius: 4px; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; }
        .checklist-item { display: flex; align-items: center; gap: 0.5rem; }
    </style>
</head>
<body>
    <p><small>Exportado em ${date}</small></p>
    ${editor.innerHTML}
</body>
</html>`;
        } else {
            content = `${title}\nExportado em ${date}\n\n${editor.textContent}`;
        }

        const blob = new Blob([content], { type: `text/${format}` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        a.href = url;
        a.download = `documento_${timestamp}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Erro ao exportar:', error);
        alert('Erro ao exportar o documento. Tente novamente.');
    }
}

// Função para atualizar contagem de palavras e caracteres
function updateWordCount() {
    try {
        const text = editor.textContent || '';
        const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const charCount = text.length;
        
        document.getElementById('wordCount').textContent = `${wordCount} palavras`;
        document.getElementById('charCount').textContent = `${charCount} caracteres`;
    } catch (error) {
        console.error('Erro ao atualizar contagem:', error);
    }
}

// Função para atualizar estado da barra de ferramentas
function updateToolbarState() {
    try {
        const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
        commands.forEach(command => {
            const button = document.querySelector(`button[onclick="formatText('${command}')"]`);
            if (button) {
                button.classList.toggle('active', document.queryCommandState(command));
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar estado da barra de ferramentas:', error);
    }
}

// Função para salvar o conteúdo automaticamente
let timeout = null;
let lastSavedContent = '';

// Versão otimizada do salvamento automático
const debouncedSave = debounce((content) => {
    try {
        localStorage.setItem('editorContent', content);
        history.add(content);
        lastSavedContent = content;
        isTyping = false;
        saveStatus.textContent = 'Salvo';
        saveStatus.classList.remove('saving');
        updateWordCount();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        saveStatus.textContent = 'Erro ao salvar';
        saveStatus.style.color = 'red';
    }
}, 1000);

// Versão otimizada da contagem de palavras
const debouncedUpdateWordCount = debounce(() => {
    try {
        const text = editor.textContent || '';
        const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const charCount = text.length;
        
        document.getElementById('wordCount').textContent = `${wordCount} palavras`;
        document.getElementById('charCount').textContent = `${charCount} caracteres`;
    } catch (error) {
        console.error('Erro ao atualizar contagem:', error);
    }
}, 300);

// Carregar tema ao iniciar
window.addEventListener('load', function() {
    try {
        loadTheme();
        history.load();
        const savedContent = localStorage.getItem('editorContent');
        if (savedContent) {
            editor.innerHTML = sanitizeHtml(savedContent);
            lastSavedContent = savedContent;
        } else {
            editor.innerHTML = '';
        }
        updateWordCount();
        setTimeout(() => editor.focus(), 0);
    } catch (error) {
        console.error('Erro ao carregar conteúdo:', error);
    }
});

// Event listeners existentes...
editor.addEventListener('input', function() {
    try {
        clearTimeout(timeout);
        const currentContent = editor.innerHTML;
        
        if (currentContent !== lastSavedContent) {
            isTyping = true;
            saveStatus.textContent = 'Salvando...';
            saveStatus.classList.add('saving');
            debouncedSave(currentContent);
        }
    } catch (error) {
        console.error('Erro ao processar entrada:', error);
    }
});

// Atualizar estado da barra de ferramentas quando a seleção muda
editor.addEventListener('mouseup', updateToolbarState);
editor.addEventListener('keyup', updateToolbarState);

// Prevenir perda de dados acidental
window.addEventListener('beforeunload', function(e) {
    if (isTyping) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Função auxiliar para verificar se está dentro de um bloco de código
function isInsideCodeBlock(element) {
    return element.closest('.code-block') !== null;
}

// Gerenciamento do menu de links
function showLinkMenu(e, link) {
    e.preventDefault();
    e.stopPropagation();

    // Remove classe ativa de qualquer link anterior
    const previousActive = editor.querySelector('a.menu-active');
    if (previousActive) {
        previousActive.classList.remove('menu-active');
    }

    // Adiciona classe ativa ao link atual
    link.classList.add('menu-active');
    activeLink = link;

    // Posiciona e mostra o menu
    const rect = link.getBoundingClientRect();
    linkMenu.style.top = `${rect.bottom + window.scrollY + 5}px`;
    linkMenu.style.left = `${rect.left + window.scrollX}px`;
    linkMenu.classList.add('show');
}

// Manipulador de clique nas opções do menu
function handleLinkMenuOption(action) {
    if (!activeLink) return;

    const url = activeLink.href;
    if (action === 'new-tab') {
        window.open(url, '_blank', 'noopener,noreferrer');
    } else {
        window.location.href = url;
    }

    closeLinkMenu();
}

// Fecha o menu de links
function closeLinkMenu() {
    linkMenu.classList.remove('show');
    if (activeLink) {
        activeLink.classList.remove('menu-active');
        activeLink = null;
    }
}

// Event listeners para o menu de links
document.addEventListener('click', function(e) {
    const link = e.target.closest('.editor-content a');
    if (link) {
        showLinkMenu(e, link);
    } else if (!e.target.closest('.link-menu')) {
        closeLinkMenu();
    }
});

linkMenu.addEventListener('click', function(e) {
    const option = e.target.closest('.link-menu-option');
    if (option) {
        handleLinkMenuOption(option.dataset.action);
    }
});

// Fecha o menu ao pressionar Esc
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeLinkMenu();
    }
});

// Função para adicionar card de tarefas
function addTaskCard() {
    const selectionData = getValidSelection();
    if (!selectionData) return;

    // Verificar se já está dentro de um card
    const existingCard = selectionData.range.commonAncestorContainer.closest('.task-card');
    if (existingCard) {
        alert('Não é possível criar um card dentro de outro card');
        return;
    }

    try {
        const { range } = selectionData;
        
        // Criar o card
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card';
        
        // Adicionar controles do card
        const controls = document.createElement('div');
        controls.className = 'card-controls';
        
        const addBtn = document.createElement('button');
        addBtn.className = 'card-control-btn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = 'Adicionar tarefa';
        addBtn.onclick = () => addTaskInput(taskCard);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-control-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = 'Excluir card';
        deleteBtn.onclick = () => deleteTaskCard(taskCard);
        
        controls.appendChild(addBtn);
        controls.appendChild(deleteBtn);
        
        // Adicionar título
        const title = document.createElement('h2');
        title.contentEditable = true;
        title.setAttribute('data-placeholder', 'Título da Lista');
        
        // Adicionar campo de entrada de tarefa
        const taskInput = createTaskInput();
        
        // Montar o card
        taskCard.appendChild(controls);
        taskCard.appendChild(title);
        taskCard.appendChild(taskInput);
        
        // Inserir o card no editor
        range.deleteContents();
        range.insertNode(taskCard);
        
        // Focar no título
        title.focus();
        
        // Atualizar histórico
        history.add(editor.innerHTML);
    } catch (error) {
        console.error('Erro ao criar card de tarefas:', error);
    }
}

// Função para criar campo de entrada de tarefa
function createTaskInput() {
    const container = document.createElement('div');
    container.className = 'task-input';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Digite uma tarefa...';
    
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    
    const addSubtaskBtn = document.createElement('button');
    addSubtaskBtn.className = 'task-action-btn';
    addSubtaskBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addSubtaskBtn.title = 'Adicionar subtarefa';
    addSubtaskBtn.onclick = () => addSubtask(container);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-action-btn';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.title = 'Remover tarefa';
    deleteBtn.onclick = () => container.remove();
    
    actions.appendChild(addSubtaskBtn);
    actions.appendChild(deleteBtn);
    
    container.appendChild(checkbox);
    container.appendChild(input);
    container.appendChild(actions);
    
    // Adicionar event listener para Enter
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const card = container.closest('.task-card');
            if (card) {
                addTaskInput(card, container);
            }
        }
    });
    
    return container;
}

// Função para adicionar nova entrada de tarefa
function addTaskInput(card, afterElement = null) {
    const newInput = createTaskInput();
    if (afterElement) {
        afterElement.after(newInput);
    } else {
        card.appendChild(newInput);
    }
    newInput.querySelector('input[type="text"]').focus();
}

// Função para adicionar subtarefa
function addSubtask(parentTask) {
    let subtasks = parentTask.querySelector('.subtasks');
    if (!subtasks) {
        subtasks = document.createElement('div');
        subtasks.className = 'subtasks';
        parentTask.appendChild(subtasks);
    }
    
    const subtaskInput = createTaskInput();
    subtasks.appendChild(subtaskInput);
    subtaskInput.querySelector('input[type="text"]').focus();
}

// Função para excluir card de tarefas
function deleteTaskCard(card) {
    if (confirm('Tem certeza que deseja excluir este card?')) {
        card.remove();
        history.add(editor.innerHTML);
    }
} 