const taskInput = document.getElementById('task-input');
const priorityEl = document.getElementById('priority');
const dueDateEl = document.getElementById('due-date');
const addBtn = document.getElementById('add-btn');
const taskList = document.getElementById('task-list');
const searchEl = document.getElementById('search');
const filterEl = document.getElementById('status-filter');
const countsEl = document.getElementById('counts');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
const snackbar = document.getElementById('snackbar');
const snackbarMsg = document.getElementById('snackbar-msg');
const undoBtn = document.getElementById('undo-btn');

let tasks = [];
let lastDeleted = null; // {task, index}
let undoTimer = null;

function loadTasks(){
	try{
		const raw = localStorage.getItem('tasks');
		tasks = raw ? JSON.parse(raw) : [];
		// migrate old tasks (ensure fields exist)
		tasks = tasks.map(t => ({
			id: t.id || Date.now().toString(),
			text: t.text || '',
			completed: !!t.completed,
			priority: t.priority || 'medium',
			dueDate: t.dueDate || '',
			createdAt: t.createdAt || Date.now(),
			notes: t.notes || ''
		}));
	}catch(e){
		tasks = [];
	}
}

function saveTasks(){
	localStorage.setItem('tasks', JSON.stringify(tasks));
	renderTasks();
}

function addTask(){
	const text = taskInput.value.trim();
	if(!text) return;
	const task = {
		id: Date.now().toString(),
		text,
		completed: false,
		priority: priorityEl.value || 'medium',
		dueDate: dueDateEl.value || '',
		notes: '',
		createdAt: Date.now()
	};
	tasks.unshift(task);
	taskInput.value = '';
	dueDateEl.value = '';
	priorityEl.value = 'medium';
	saveTasks();
}

function toggleComplete(id){
	const t = tasks.find(x=>x.id===id);
	if(!t) return;
	t.completed = !t.completed;
	saveTasks();
}

function deleteTask(id){
	const index = tasks.findIndex(x=>x.id===id);
	if(index === -1) return;
	lastDeleted = {task: tasks[index], index};
	tasks.splice(index,1);
	saveTasks();
	showSnackbar('Task deleted', 5000);
}

function undoDelete(){
	if(!lastDeleted) return;
	tasks.splice(lastDeleted.index,0,lastDeleted.task);
	lastDeleted = null;
	clearSnackbar();
	saveTasks();
}

function updateTaskText(id,newText){
	const t = tasks.find(x=>x.id===id);
	if(!t) return;
	t.text = newText;
	saveTasks();
}

function exportTasks(){
	const data = JSON.stringify(tasks, null, 2);
	const blob = new Blob([data], {type: 'application/json'});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `tasks-${new Date().toISOString().slice(0,10)}.json`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

function importTasksFromFile(file){
	const reader = new FileReader();
	reader.onload = e => {
		try{
			const parsed = JSON.parse(e.target.result);
			if(!Array.isArray(parsed)) throw new Error('Invalid format');
			const replace = confirm('Replace existing tasks with imported tasks? Press Cancel to merge.');
			const normalized = parsed.map(t=>({
				id: t.id || Date.now().toString(),
				text: t.text || '',
				completed: !!t.completed,
				priority: t.priority || 'medium',
				dueDate: t.dueDate || '',
				notes: t.notes || '',
				createdAt: t.createdAt || Date.now()
			}));
			if(replace){
				tasks = normalized;
			}else{
				// merge: keep existing, append imported at top
				tasks = normalized.concat(tasks);
			}
			saveTasks();
			alert('Import complete');
		}catch(err){
			alert('Failed to import: ' + err.message);
		}
	};
	reader.readAsText(file);
}

function showSnackbar(message, timeout=4000){
	snackbarMsg.textContent = message;
	snackbar.hidden = false;
	if(undoTimer) clearTimeout(undoTimer);
	undoTimer = setTimeout(()=>{
		// clear lastDeleted after timeout
		lastDeleted = null;
		clearSnackbar();
	}, timeout);
}

function clearSnackbar(){
	snackbar.hidden = true;
	snackbarMsg.textContent = '';
	if(undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
}

function renderTasks(){
	taskList.innerHTML = '';
	const q = searchEl.value.trim().toLowerCase();
	const filter = filterEl.value;
	const filtered = tasks.filter(t=>{
		const matchesQ = t.text.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q));
		const matchesFilter = (filter==='all') || (filter==='completed' && t.completed) || (filter==='pending' && !t.completed);
		return matchesQ && matchesFilter;
	});

	if(filtered.length===0){
		const li = document.createElement('li');
		li.className = 'task empty';
		li.innerHTML = '<div class="left"><span class="text muted">No tasks found</span></div>';
		taskList.appendChild(li);
	}

	filtered.forEach(t => {
		const li = document.createElement('li');
		li.className = 'task' + (t.completed? ' completed':'');
		li.dataset.id = t.id;

		const left = document.createElement('div');
		left.className = 'left';

		const label = document.createElement('label');
		const cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.checked = t.completed;
		cb.addEventListener('change', ()=> toggleComplete(t.id));

		const span = document.createElement('span');
		span.className = 'text';
		span.textContent = t.text;

		const badge = document.createElement('span');
		badge.className = `priority-badge priority-${t.priority||'medium'}`;
		badge.textContent = (t.priority||'medium').charAt(0).toUpperCase() + (t.priority||'medium').slice(1);

		label.appendChild(cb);
		label.appendChild(span);
		label.appendChild(badge);

		if(t.dueDate){
			const due = document.createElement('span');
			due.className = 'due-date';
			const d = new Date(t.dueDate);
			due.textContent = `Due ${d.toLocaleDateString()}`;
			label.appendChild(due);
		}

		left.appendChild(label);

		const actions = document.createElement('div');
		actions.className = 'actions';

		const editBtn = document.createElement('button');
		editBtn.className = 'edit';
		editBtn.innerHTML = '<span aria-hidden="true">✏️</span>';
		editBtn.title = 'Edit task';
		editBtn.setAttribute('aria-label','Edit task');
		editBtn.addEventListener('click', ()=> startEdit(li,t));

		const delBtn = document.createElement('button');
		delBtn.className = 'delete';
		delBtn.innerHTML = '<span aria-hidden="true">🗑️</span>';
		delBtn.title = 'Delete task';
		delBtn.setAttribute('aria-label','Delete task');
		delBtn.addEventListener('click', ()=>{
			if(confirm('Delete this task?')) deleteTask(t.id);
		});

		actions.appendChild(editBtn);
		actions.appendChild(delBtn);

		li.appendChild(left);
		li.appendChild(actions);
		taskList.appendChild(li);
	});

	updateCounts();
}

function startEdit(li, task){
	const left = li.querySelector('.left');
	left.innerHTML = '';
	const input = document.createElement('input');
	input.type = 'text';
	input.value = task.text;
	input.style.flex = '1';

	const prioritySel = document.createElement('select');
	['low','medium','high'].forEach(p=>{
		const o = document.createElement('option'); o.value = p; o.textContent = p.charAt(0).toUpperCase()+p.slice(1);
		if(p===task.priority) o.selected = true;
		prioritySel.appendChild(o);
	});

	const due = document.createElement('input');
	due.type = 'date';
	due.value = task.dueDate || '';

	const saveBtn = document.createElement('button');
	saveBtn.className = 'save';
	saveBtn.innerHTML = '<span aria-hidden="true">💾</span>';
	saveBtn.title = 'Save changes';
	saveBtn.setAttribute('aria-label','Save task');
	saveBtn.addEventListener('click', ()=>{
		const newText = input.value.trim();
		if(!newText){ alert('Task cannot be empty'); return; }
		task.text = newText;
		task.priority = prioritySel.value;
		task.dueDate = due.value || '';
		saveTasks();
	});

	const cancelBtn = document.createElement('button');
	cancelBtn.innerHTML = '<span aria-hidden="true">✖️</span>';
	cancelBtn.title = 'Cancel';
	cancelBtn.setAttribute('aria-label','Cancel');
	cancelBtn.addEventListener('click', ()=> renderTasks());

	left.appendChild(input);
	left.appendChild(prioritySel);
	left.appendChild(due);
	left.appendChild(saveBtn);
	left.appendChild(cancelBtn);
	input.focus();
	input.select();
}

function updateCounts(){
	const total = tasks.length;
	const done = tasks.filter(t=>t.completed).length;
	countsEl.textContent = `${total} task${total!==1?'s':''} — ${done} completed`;
}

// Event wiring
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(); });
searchEl.addEventListener('input', renderTasks);
filterEl.addEventListener('change', renderTasks);
exportBtn.addEventListener('click', exportTasks);
importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', e=>{ if(e.target.files && e.target.files[0]) importTasksFromFile(e.target.files[0]); });
if(undoBtn) undoBtn.addEventListener('click', ()=> undoDelete());

// Button icon polish and accessibility
try{
	if(addBtn){ addBtn.innerHTML = '<span aria-hidden="true">➕</span> Add'; addBtn.title = 'Add task'; }
	if(exportBtn){ exportBtn.innerHTML = '<span aria-hidden="true">⬇️</span> Export'; exportBtn.title = 'Export tasks'; }
	if(importBtn){ importBtn.innerHTML = '<span aria-hidden="true">⬆️</span> Import'; importBtn.title = 'Import tasks'; }
	if(undoBtn){ undoBtn.innerHTML = '<span aria-hidden="true">↩️</span> Undo'; undoBtn.title = 'Undo delete'; }
}catch(e){}


// Initial load
loadTasks();
renderTasks();


