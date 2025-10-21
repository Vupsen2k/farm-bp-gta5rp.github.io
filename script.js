document.addEventListener('DOMContentLoaded', () => {
	// Elements
	const x2ServerToggle = document.getElementById('x2Server')
	const vipToggle = document.getElementById('vipToggle')
	const totalBPSpan = document.getElementById('totalBP')
	const checkboxes = document.querySelectorAll(
		'input[type="checkbox"][data-bp]'
	)
	const postTimerSpan = document.getElementById('postTimer')
	const resetBtn = document.getElementById('resetBtn')
	const counterButtons = document.querySelectorAll('.counter-btn')
	const settingsBtn = document.getElementById('settingsBtn')
	const settingsModal = document.getElementById('settingsModal')
	const closeSettings = document.getElementById('closeSettings')
	const mainTasksSettings = document.getElementById('mainTasksSettings')
	const fractionTasksSettings = document.getElementById('fractionTasksSettings')
	const additionalTasksSettings = document.getElementById(
		'additionalTasksSettings'
	)
	const dpInput = document.getElementById('dpInput')

	// Элементы пагинации
	const pageButtons = document.querySelectorAll('.page-btn')
	const pages = document.querySelectorAll('.page')

	// Элементы таймеров
	const addTimerBtn = document.getElementById('addTimerBtn')
	const timerModal = document.getElementById('timerModal')
	const closeTimerModal = document.getElementById('closeTimerModal')
	const cancelTimerBtn = document.getElementById('cancelTimerBtn')
	const saveTimerBtn = document.getElementById('saveTimerBtn')
	const timerNameInput = document.getElementById('timerName')
	const timerDurationInput = document.getElementById('timerDuration')
	const timersContainer = document.getElementById('timersContainer')

	// State
	let timerInterval = null
	const counters = {}
	const hiddenTasks = new Set()

	// Состояние таймеров
	let userTimers = []
	let timerIntervals = {}
	let timerStartTimes = {}

	// ========== СИСТЕМА ЗАДАНИЙ BP ==========

	// Initialize counters from localStorage or set to 0
	function initializeCounters() {
		counterButtons.forEach(btn => {
			const counterId = btn.dataset.counter
			const savedValue = localStorage.getItem(`counter_${counterId}`)
			counters[counterId] = savedValue ? parseInt(savedValue) : 0
			document.getElementById(counterId).textContent = counters[counterId]

			// Check if target is reached
			const target = parseInt(btn.dataset.target)
			const checkboxId = btn.dataset.checkbox
			if (counters[counterId] >= target) {
				document.getElementById(checkboxId).checked = true
			}
		})
	}

	// Get current time in MSK (UTC+3)
	function getMSKTime() {
		const now = new Date()
		const utc = now.getTime() + now.getTimezoneOffset() * 60000
		return new Date(utc + 3 * 3600000) // MSK is UTC+3
	}

	// Check if reset is needed (before 7:00 MSK today)
	function shouldReset() {
		const savedData = localStorage.getItem('bpProgress')
		if (!savedData) return false

		const { timestamp } = JSON.parse(savedData)
		const lastSaved = new Date(timestamp)
		const nowMSK = getMSKTime()

		const today7AM = new Date(
			Date.UTC(
				nowMSK.getUTCFullYear(),
				nowMSK.getUTCMonth(),
				nowMSK.getUTCDate(),
				4,
				0,
				0,
				0
			)
		)

		return lastSaved < today7AM
	}

	// Save progress to localStorage
	function saveProgress() {
		const progress = {
			x2Server: x2ServerToggle.checked,
			vipToggle: vipToggle.checked,
			tasks: Array.from(checkboxes).reduce((acc, cb) => {
				acc[cb.id] = cb.checked
				return acc
			}, {}),
			counters: { ...counters },
			hiddenTasks: Array.from(hiddenTasks),
			dp: dpInput.value,
			timestamp: new Date().toISOString(),
		}
		localStorage.setItem('bpProgress', JSON.stringify(progress))

		for (const [counterId, value] of Object.entries(counters)) {
			localStorage.setItem(`counter_${counterId}`, value)
		}
	}

	// Load progress from localStorage
	function loadProgress() {
		if (shouldReset()) {
			console.log('Auto-reset at 7:00 MSK')
			localStorage.removeItem('bpProgress')
			counterButtons.forEach(btn => {
				const counterId = btn.dataset.counter
				counters[counterId] = 0
				document.getElementById(counterId).textContent = counters[counterId]
				localStorage.removeItem(`counter_${counterId}`)
			})

			checkboxes.forEach(checkbox => {
				checkbox.checked = false
			})
			x2ServerToggle.checked = false
			vipToggle.checked = false
			hiddenTasks.clear()
			dpInput.value = 0
			return
		}

		const savedData = localStorage.getItem('bpProgress')
		if (savedData) {
			try {
				const {
					x2Server,
					vipToggle: vip,
					tasks,
					counters: savedCounters,
					hiddenTasks: savedHiddenTasks,
					dp,
				} = JSON.parse(savedData)

				x2ServerToggle.checked = x2Server || false
				vipToggle.checked = vip || false

				if (tasks) {
					Object.keys(tasks).forEach(id => {
						const cb = document.getElementById(id)
						if (cb) cb.checked = tasks[id]
					})
				}

				if (savedCounters) {
					Object.keys(savedCounters).forEach(counterId => {
						counters[counterId] = savedCounters[counterId]
						const counterElement = document.getElementById(counterId)
						if (counterElement) {
							counterElement.textContent = counters[counterId]
						}
					})
				}

				if (savedHiddenTasks) {
					hiddenTasks.clear()
					savedHiddenTasks.forEach(taskId => {
						hiddenTasks.add(taskId)
					})
					updateTaskVisibility()
				}

				if (dp !== undefined) {
					dpInput.value = dp
				}
			} catch (e) {
				console.error('Error loading saved data:', e)
				localStorage.removeItem('bpProgress')
			}
		}

		initializeCounters()
	}

	// Calculate BP with bonuses
	function calculateBP(bpValues, isVIP, isX2Server) {
		const baseBP = parseInt(bpValues[0])
		let bp = baseBP
		if (isX2Server) bp *= 2
		if (isVIP) bp *= 2
		return bp
	}

	// Function to add/remove DP when task is completed/uncompleted
	function updateDPForTask(checkbox, isChecked) {
		const bpValues = checkbox.getAttribute('data-bp').split('/')
		const baseBP = parseInt(bpValues[0])

		const isVIP = vipToggle.checked
		const isX2Server = x2ServerToggle.checked
		let dpToAdd = baseBP
		if (isX2Server) dpToAdd *= 2
		if (isVIP) dpToAdd *= 2

		const currentDP = parseInt(dpInput.value) || 0

		if (isChecked) {
			dpInput.value = currentDP + dpToAdd
		} else {
			dpInput.value = Math.max(0, currentDP - dpToAdd)
		}
		saveProgress()
	}

	// Update total BP count
	function updateTotalBP() {
		let totalBP = 0
		const isVIP = vipToggle.checked
		const isX2Server = x2ServerToggle.checked

		checkboxes.forEach(checkbox => {
			if (checkbox.checked && !hiddenTasks.has(checkbox.id)) {
				const bpValues = checkbox.getAttribute('data-bp').split('/')
				totalBP += calculateBP(bpValues, isVIP, isX2Server)
			}
		})

		totalBPSpan.textContent = totalBP
		saveProgress()
	}

	// Update BP displays for all tasks
	function updateBPDisplays() {
		const isVIP = vipToggle.checked
		const isX2Server = x2ServerToggle.checked

		checkboxes.forEach(checkbox => {
			const bpValues = checkbox.getAttribute('data-bp').split('/')
			const bp = calculateBP(bpValues, isVIP, isX2Server)
			const bpDisplay = checkbox.parentElement.querySelector('.bp')
			if (bpDisplay) {
				bpDisplay.textContent = `${bp} BP`
			}
		})

		updateTotalBP()
	}

	// Start timer for post counter
	function startTimer(counterId, target) {
		if (timerInterval) clearInterval(timerInterval)
		let timeLeft = 10 * 60

		timerInterval = setInterval(() => {
			const minutes = Math.floor(timeLeft / 60)
			const seconds = timeLeft % 60
			postTimerSpan.textContent = `${minutes}:${
				seconds < 10 ? '0' : ''
			}${seconds}`
			timeLeft--

			if (timeLeft < 0) {
				clearInterval(timerInterval)
				postTimerSpan.textContent = ''
				counters[counterId] = 0
				document.getElementById(counterId).textContent = counters[counterId]
				document.getElementById('post10').checked = false
				saveProgress()
				updateBPDisplays()
			}
		}, 1000)
	}

	// Increment counter function
	function incrementCounter(event) {
		const btn = event.target.closest('.counter-btn')
		if (!btn) return

		const counterId = btn.dataset.counter
		const target = parseInt(btn.dataset.target)
		const checkboxId = btn.dataset.checkbox

		if (counters[counterId] < target) {
			counters[counterId]++
			document.getElementById(counterId).textContent = counters[counterId]

			if (counterId === 'postCounter') {
				if (timerInterval) clearInterval(timerInterval)
				startTimer(counterId, target)
			}

			if (counters[counterId] >= target) {
				const checkbox = document.getElementById(checkboxId)
				checkbox.checked = true
				updateDPForTask(checkbox, true)
			}

			saveProgress()
			updateBPDisplays()
		}
	}

	// Reset all checkboxes and counters
	function resetCheckboxes() {
		checkboxes.forEach(checkbox => {
			checkbox.checked = false
		})
		x2ServerToggle.checked = false
		vipToggle.checked = false

		counterButtons.forEach(btn => {
			const counterId = btn.dataset.counter
			counters[counterId] = 0
			document.getElementById(counterId).textContent = counters[counterId]
		})

		dpInput.value = 0

		clearInterval(timerInterval)
		postTimerSpan.textContent = ''
		saveProgress()
		updateBPDisplays()
	}

	// Update task visibility based on hiddenTasks
	function updateTaskVisibility() {
		document.querySelectorAll('.task').forEach(task => {
			const taskId = task.dataset.taskId
			if (hiddenTasks.has(taskId)) {
				task.style.display = 'none'
			} else {
				task.style.display = 'flex'
			}
		})
	}

	// Initialize settings modal
	function initializeSettingsModal() {
		mainTasksSettings.innerHTML = ''
		fractionTasksSettings.innerHTML = ''
		additionalTasksSettings.innerHTML = ''

		document
			.querySelectorAll('.task-section:first-child .task')
			.forEach(task => {
				const taskId = task.dataset.taskId
				const label = task.querySelector('label').textContent

				const taskElement = document.createElement('div')
				taskElement.className = 'settings-task'
				taskElement.innerHTML = `
                <input type="checkbox" id="settings-${taskId}" ${
					hiddenTasks.has(taskId) ? '' : 'checked'
				} />
                <label for="settings-${taskId}">${label}</label>
            `
				mainTasksSettings.appendChild(taskElement)

				const checkbox = taskElement.querySelector('input')
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						hiddenTasks.delete(taskId)
					} else {
						hiddenTasks.add(taskId)
					}
					updateTaskVisibility()
					saveProgress()
					updateBPDisplays()
				})
			})

		document
			.querySelectorAll('.task-section:nth-child(2) .task')
			.forEach(task => {
				const taskId = task.dataset.taskId
				const label = task.querySelector('label').textContent

				const taskElement = document.createElement('div')
				taskElement.className = 'settings-task'
				taskElement.innerHTML = `
                <input type="checkbox" id="settings-${taskId}" ${
					hiddenTasks.has(taskId) ? '' : 'checked'
				} />
                <label for="settings-${taskId}">${label}</label>
            `
				fractionTasksSettings.appendChild(taskElement)

				const checkbox = taskElement.querySelector('input')
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						hiddenTasks.delete(taskId)
					} else {
						hiddenTasks.add(taskId)
					}
					updateTaskVisibility()
					saveProgress()
					updateBPDisplays()
				})
			})

		document
			.querySelectorAll('.task-section:nth-child(3) .task')
			.forEach(task => {
				const taskId = task.dataset.taskId
				const label = task.querySelector('label').textContent

				const taskElement = document.createElement('div')
				taskElement.className = 'settings-task'
				taskElement.innerHTML = `
                <input type="checkbox" id="settings-${taskId}" ${
					hiddenTasks.has(taskId) ? '' : 'checked'
				} />
                <label for="settings-${taskId}">${label}</label>
            `
				additionalTasksSettings.appendChild(taskElement)

				const checkbox = taskElement.querySelector('input')
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						hiddenTasks.delete(taskId)
					} else {
						hiddenTasks.add(taskId)
					}
					updateTaskVisibility()
					saveProgress()
					updateBPDisplays()
				})
			})
	}

	// ========== СИСТЕМА ПАГИНАЦИИ ==========

	function initializePagination() {
		pageButtons.forEach(btn => {
			btn.addEventListener('click', () => {
				const targetPage = btn.dataset.page

				pageButtons.forEach(b => b.classList.remove('active'))
				btn.classList.add('active')

				pages.forEach(page => {
					page.classList.remove('active')
					if (page.id === `${targetPage}-page`) {
						page.classList.add('active')
					}
				})

				localStorage.setItem('currentPage', targetPage)
			})
		})

		const savedPage = localStorage.getItem('currentPage')
		if (savedPage) {
			const savedBtn = document.querySelector(`[data-page="${savedPage}"]`)
			if (savedBtn) {
				savedBtn.click()
			}
		}
	}

	// ========== СИСТЕМА ТАЙМЕРОВ ==========

	// Предустановленные таймеры
	const presetTimers = {
		post: { name: '📮 Почта', totalTime: 10 * 60, currentTime: 10 * 60 },
		carTheft: {
			name: '🚗 Угон авто',
			totalTime: 90 * 60,
			currentTime: 90 * 60,
		},
		pimping: { name: '💃 Сутенерка', totalTime: 90 * 60, currentTime: 90 * 60 },
		club: { name: '🎵 Клуб', totalTime: 120 * 60, currentTime: 120 * 60 },
	}

	function formatTime(seconds) {
		const hours = Math.floor(seconds / 3600)
		const minutes = Math.floor((seconds % 3600) / 60)
		const secs = seconds % 60

		if (hours > 0) {
			return `${hours.toString().padStart(2, '0')}:${minutes
				.toString()
				.padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
		}
		return `${minutes.toString().padStart(2, '0')}:${secs
			.toString()
			.padStart(2, '0')}`
	}

	// Создание HTML для маленького таймера
	function createSmallTimerHTML(timer, isPreset = false) {
		const progress =
			timer.totalTime > 0 ? (timer.currentTime / timer.totalTime) * 100 : 0
		const isRunning = timerIntervals[timer.id]

		return `
        <div class="small-timer-card ${isRunning ? 'running' : ''} ${
			timer.currentTime === 0 ? 'finished' : ''
		}" data-timer-id="${timer.id}">
            <div class="small-timer-header">
                <h4 class="small-timer-title">${timer.name}</h4>
                ${
									isPreset
										? `<button class="small-timer-action-btn restart-timer" title="Перезапустить">↻</button>`
										: `<button class="small-timer-action-btn delete-timer" title="Удалить">🗑️</button>`
								}
            </div>
            <div class="small-timer-display">
                <div class="small-timer-time">${formatTime(
									timer.currentTime
								)}</div>
                <div class="small-timer-progress">
                    <div class="small-timer-progress-bar" style="width: ${progress}%"></div>
                </div>
            </div>
            <div class="small-timer-controls">
                <button class="small-timer-control-btn start" ${
									timer.currentTime === 0 ? 'disabled' : ''
								}>
                    ${isRunning ? 'Пауза' : 'Старт'}
                </button>
                ${
									!isPreset
										? `<button class="small-timer-control-btn reset">Сброс</button>`
										: ''
								}
            </div>
        </div>
    `
	}

	// Отрисовка всех таймеров
	function renderTimers() {
		// Отрисовка предустановленных таймеров
		const presetTimersContainer = document.querySelector('.small-timers-grid')
		if (presetTimersContainer) {
			presetTimersContainer.innerHTML = Object.entries(presetTimers)
				.map(([id, timer]) => createSmallTimerHTML({ ...timer, id }, true))
				.join('')
		}

		// Отрисовка пользовательских таймеров
		const userTimersGrid = document.getElementById('userTimersGrid')
		if (userTimers.length === 0) {
			userTimersGrid.innerHTML = `
            <div class="no-timers-message">
                <p>Пока нет пользовательских таймеров</p>
            </div>
        `
		} else {
			userTimersGrid.innerHTML = userTimers
				.map(timer => createSmallTimerHTML(timer, false))
				.join('')
		}

		attachTimerEventListeners()
	}

	// Прикрепление обработчиков событий к таймерам
	function attachTimerEventListeners() {
		// Кнопки старт/пауза для всех таймеров
		document.querySelectorAll('.small-timer-control-btn.start').forEach(btn => {
			btn.addEventListener('click', function () {
				const timerCard = this.closest('.small-timer-card')
				const timerId = timerCard.dataset.timerId

				console.log('Start button clicked for timer:', timerId)

				// Проверяем, предустановленный это таймер или пользовательский
				if (presetTimers[timerId]) {
					const timer = presetTimers[timerId]
					if (timerIntervals[timerId]) {
						pauseUserTimer(timerId, true)
					} else {
						startUserTimer(timerId, timer, true)
					}
				} else {
					const timer = userTimers.find(t => t.id === timerId)
					if (timer) {
						if (timerIntervals[timerId]) {
							pauseUserTimer(timerId)
						} else {
							startUserTimer(timerId, timer)
						}
					}
				}
			})
		})

		// Кнопки сброса для пользовательских таймеров
		document.querySelectorAll('.small-timer-control-btn.reset').forEach(btn => {
			btn.addEventListener('click', function () {
				const timerCard = this.closest('.small-timer-card')
				const timerId = timerCard.dataset.timerId
				resetUserTimer(timerId)
			})
		})

		// Кнопки перезапуска для предустановленных таймеров
		document.querySelectorAll('.restart-timer').forEach(btn => {
			btn.addEventListener('click', function () {
				const timerCard = this.closest('.small-timer-card')
				const timerId = timerCard.dataset.timerId
				restartPresetTimer(timerId)
			})
		})

		// Кнопки удаления для пользовательских таймеров
		document.querySelectorAll('.delete-timer').forEach(btn => {
			btn.addEventListener('click', function () {
				const timerCard = this.closest('.small-timer-card')
				const timerId = timerCard.dataset.timerId
				deleteTimer(timerId)
			})
		})
	}

	// Запуск пользовательского таймера
	function startUserTimer(timerId, timer, isPreset = false) {
		if (timerIntervals[timerId]) {
			console.log('Timer already running:', timerId)
			return
		}

		if (!timer || timer.currentTime === 0) {
			console.log('Timer not found or finished:', timerId)
			return
		}

		console.log('Starting timer:', timerId, timer)

		const startTime = Date.now()
		const initialTime = timer.currentTime

		timerStartTimes[timerId] = startTime

		// Сохраняем время старта
		if (!isPreset) {
			saveTimersToStorage()
		} else {
			savePresetTimersToStorage()
		}

		timerIntervals[timerId] = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime) / 1000)
			timer.currentTime = Math.max(0, initialTime - elapsed)
			updateTimerDisplay(timerId)

			if (timer.currentTime <= 0) {
				clearInterval(timerIntervals[timerId])
				delete timerIntervals[timerId]
				delete timerStartTimes[timerId]
				timer.currentTime = 0
				updateTimerDisplay(timerId)

				if (Notification.permission === 'granted') {
					new Notification(`Таймер "${timer.name}" завершен!`)
				}

				playNotificationSound()

				// Сохраняем состояние для пользовательских таймеров
				if (!isPreset) {
					saveTimersToStorage()
				} else {
					savePresetTimersToStorage()
				}
			}
		}, 1000)

		updateTimerDisplay(timerId)

		// Сохраняем состояние сразу после запуска
		if (!isPreset) {
			saveTimersToStorage()
		} else {
			savePresetTimersToStorage()
		}
	}

	// Пауза пользовательского таймера
	function pauseUserTimer(timerId, isPreset = false) {
		if (timerIntervals[timerId]) {
			clearInterval(timerIntervals[timerId])
			delete timerIntervals[timerId]

			// Обновляем текущее время при паузе
			if (timerStartTimes[timerId]) {
				const startTime = timerStartTimes[timerId]
				const elapsed = Math.floor((Date.now() - startTime) / 1000)

				let timer
				if (presetTimers[timerId]) {
					timer = presetTimers[timerId]
				} else {
					timer = userTimers.find(t => t.id === timerId)
				}

				if (timer) {
					timer.currentTime = Math.max(0, timer.currentTime - elapsed)
				}

				delete timerStartTimes[timerId]
			}

			updateTimerDisplay(timerId)

			// Сохраняем состояние для пользовательских таймеров
			if (!isPreset) {
				saveTimersToStorage()
			} else {
				savePresetTimersToStorage()
			}
		}
	}

	// Сброс пользовательского таймера
	function resetUserTimer(timerId) {
		pauseUserTimer(timerId)
		const timer = userTimers.find(t => t.id === timerId)
		if (timer) {
			timer.currentTime = timer.totalTime
			updateTimerDisplay(timerId)
			saveTimersToStorage()
		}
	}

	// Перезапуск предустановленного таймера
	function restartPresetTimer(timerId) {
		pauseUserTimer(timerId, true)
		const timer = presetTimers[timerId]
		if (timer) {
			timer.currentTime = timer.totalTime
			updateTimerDisplay(timerId)
			savePresetTimersToStorage()
		}
	}

	// Удаление таймера
	function deleteTimer(timerId) {
		// Удаляем без подтверждения
		pauseUserTimer(timerId)
		userTimers = userTimers.filter(t => t.id !== timerId)
		saveTimersToStorage()
		renderTimers()
	}

	// Обновление отображения таймера
	function updateTimerDisplay(timerId) {
		const timerCard = document.querySelector(`[data-timer-id="${timerId}"]`)
		if (!timerCard) {
			console.log('Timer card not found:', timerId)
			return
		}

		let timer
		if (presetTimers[timerId]) {
			timer = presetTimers[timerId]
		} else {
			timer = userTimers.find(t => t.id === timerId)
		}

		if (!timer) {
			console.log('Timer not found:', timerId)
			return
		}

		const timeDisplay = timerCard.querySelector('.small-timer-time')
		const progressBar = timerCard.querySelector('.small-timer-progress-bar')
		const startBtn = timerCard.querySelector('.start')
		const isRunning = timerIntervals[timerId]

		if (timeDisplay) {
			timeDisplay.textContent = formatTime(timer.currentTime)
		}

		if (progressBar) {
			const progress =
				timer.totalTime > 0 ? (timer.currentTime / timer.totalTime) * 100 : 0
			progressBar.style.width = `${progress}%`
		}

		timerCard.classList.toggle('running', isRunning)
		timerCard.classList.toggle('finished', timer.currentTime === 0)

		if (startBtn) {
			startBtn.disabled = timer.currentTime === 0
			startBtn.textContent = isRunning ? 'Пауза' : 'Старт'
		}
	}

	// Сохранение пользовательских таймеров в localStorage
	function saveTimersToStorage() {
		const timersData = userTimers.map(timer => ({
			id: timer.id,
			name: timer.name,
			totalTime: timer.totalTime,
			currentTime: timer.currentTime,
			createdAt: timer.createdAt,
		}))
		localStorage.setItem('userTimers', JSON.stringify(timersData))

		// Сохраняем время старта работающих таймеров
		const runningTimers = {}
		Object.keys(timerStartTimes).forEach(timerId => {
			if (timerIntervals[timerId]) {
				runningTimers[timerId] = {
					startTime: timerStartTimes[timerId],
					initialTime:
						userTimers.find(t => t.id === timerId)?.currentTime ||
						presetTimers[timerId]?.currentTime,
				}
			}
		})
		localStorage.setItem('runningTimers', JSON.stringify(runningTimers))
	}

	// Сохранение предустановленных таймеров в localStorage
	function savePresetTimersToStorage() {
		const presetTimersData = {}
		Object.keys(presetTimers).forEach(timerId => {
			presetTimersData[timerId] = {
				currentTime: presetTimers[timerId].currentTime,
			}
		})
		localStorage.setItem('presetTimers', JSON.stringify(presetTimersData))

		// Сохраняем время старта работающих предустановленных таймеров
		const runningTimers = {}
		Object.keys(timerStartTimes).forEach(timerId => {
			if (timerIntervals[timerId] && presetTimers[timerId]) {
				runningTimers[timerId] = {
					startTime: timerStartTimes[timerId],
					initialTime: presetTimers[timerId].currentTime,
				}
			}
		})
		localStorage.setItem('runningPresetTimers', JSON.stringify(runningTimers))
	}

	// Загрузка таймеров из localStorage
	function loadTimersFromStorage() {
		// Загружаем пользовательские таймеры
		const savedTimers = localStorage.getItem('userTimers')
		if (savedTimers) {
			try {
				const parsedTimers = JSON.parse(savedTimers)
				userTimers = parsedTimers.map(timer => ({
					...timer,
					currentTime:
						timer.currentTime > 0 ? timer.currentTime : timer.totalTime,
				}))
			} catch (e) {
				console.error('Error loading user timers:', e)
				userTimers = []
			}
		}

		// Загружаем состояние предустановленных таймеров
		const savedPresetTimers = localStorage.getItem('presetTimers')
		if (savedPresetTimers) {
			try {
				const parsedPresetTimers = JSON.parse(savedPresetTimers)
				Object.keys(parsedPresetTimers).forEach(timerId => {
					if (presetTimers[timerId]) {
						presetTimers[timerId].currentTime =
							parsedPresetTimers[timerId].currentTime
					}
				})
			} catch (e) {
				console.error('Error loading preset timers:', e)
			}
		}

		renderTimers()
	}

	// Создание нового таймера
	function createNewTimer() {
		const name = timerNameInput.value.trim()
		const duration = parseInt(timerDurationInput.value)

		if (!name) {
			alert('Пожалуйста, введите название таймера')
			return
		}

		if (isNaN(duration) || duration < 1 || duration > 1440) {
			alert('Пожалуйста, введите корректную длительность (1-1440 минут)')
			return
		}

		const newTimer = {
			id: 'user_' + Date.now().toString(),
			name: name,
			totalTime: duration * 60,
			currentTime: duration * 60,
			createdAt: new Date().toISOString(),
		}

		userTimers.push(newTimer)
		saveTimersToStorage()
		renderTimers()
		closeTimerModalFunc()
	}

	function closeTimerModalFunc() {
		timerModal.style.display = 'none'
		timerNameInput.value = ''
		timerDurationInput.value = '60'
	}

	function requestNotificationPermission() {
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission()
		}
	}

	// Воспроизведение звука уведомления
	function playNotificationSound() {
		try {
			const audioContext = new (window.AudioContext ||
				window.webkitAudioContext)()
			const oscillator = audioContext.createOscillator()
			const gainNode = audioContext.createGain()

			oscillator.connect(gainNode)
			gainNode.connect(audioContext.destination)

			oscillator.frequency.value = 800
			oscillator.type = 'sine'

			gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
			gainNode.gain.exponentialRampToValueAtTime(
				0.01,
				audioContext.currentTime + 1
			)

			oscillator.start(audioContext.currentTime)
			oscillator.stop(audioContext.currentTime + 1)
		} catch (e) {
			console.log('Audio context not supported:', e)
		}
	}

	// Восстановление работающих таймеров после перезагрузки
	function restoreRunningTimers() {
		console.log('Restoring running timers...')

		// Восстанавливаем предустановленные таймеры
		const savedRunningPresetTimers = localStorage.getItem('runningPresetTimers')
		if (savedRunningPresetTimers) {
			try {
				const runningTimers = JSON.parse(savedRunningPresetTimers)
				Object.keys(runningTimers).forEach(timerId => {
					const data = runningTimers[timerId]
					const timer = presetTimers[timerId]

					if (timer && data.startTime && data.initialTime) {
						const elapsed = Math.floor((Date.now() - data.startTime) / 1000)
						const remainingTime = Math.max(0, data.initialTime - elapsed)

						console.log(
							`Preset timer ${timerId}: elapsed ${elapsed}s, remaining ${remainingTime}s`
						)

						if (remainingTime > 0) {
							timer.currentTime = remainingTime
							console.log(
								`Restoring preset timer: ${timer.name}, remaining: ${remainingTime}s`
							)
							startUserTimer(timerId, timer, true)
						} else {
							timer.currentTime = 0
							console.log(
								`Preset timer ${timerId} finished while page was closed`
							)
							if (Notification.permission === 'granted') {
								new Notification(`Таймер "${timer.name}" завершен!`)
							}
							playNotificationSound()
							savePresetTimersToStorage()
						}
					}
				})
			} catch (e) {
				console.error('Error restoring running preset timers:', e)
			}
		}

		// Восстанавливаем пользовательские таймеры
		const savedRunningTimers = localStorage.getItem('runningTimers')
		if (savedRunningTimers) {
			try {
				const runningTimers = JSON.parse(savedRunningTimers)
				Object.keys(runningTimers).forEach(timerId => {
					const data = runningTimers[timerId]
					const timer = userTimers.find(t => t.id === timerId)

					if (timer && data.startTime && data.initialTime) {
						const elapsed = Math.floor((Date.now() - data.startTime) / 1000)
						const remainingTime = Math.max(0, data.initialTime - elapsed)

						console.log(
							`User timer ${timerId}: elapsed ${elapsed}s, remaining ${remainingTime}s`
						)

						if (remainingTime > 0) {
							timer.currentTime = remainingTime
							console.log(
								`Restoring user timer: ${timer.name}, remaining: ${remainingTime}s`
							)
							startUserTimer(timerId, timer)
						} else {
							timer.currentTime = 0
							console.log(
								`User timer ${timerId} finished while page was closed`
							)
							if (Notification.permission === 'granted') {
								new Notification(`Таймер "${timer.name}" завершен!`)
							}
							playNotificationSound()
							saveTimersToStorage()
						}
					}
				})
			} catch (e) {
				console.error('Error restoring running user timers:', e)
			}
		}

		// Перерисовываем таймеры после восстановления
		setTimeout(() => {
			renderTimers()
		}, 100)
	}

	function initializeTimers() {
		requestNotificationPermission()
		loadTimersFromStorage()

		// Обработчики для кнопки добавления таймера
		if (addTimerBtn) {
			addTimerBtn.addEventListener('click', () => {
				console.log('Add timer button clicked')
				timerModal.style.display = 'flex'
			})
		}

		if (closeTimerModal) {
			closeTimerModal.addEventListener('click', closeTimerModalFunc)
		}

		if (cancelTimerBtn) {
			cancelTimerBtn.addEventListener('click', closeTimerModalFunc)
		}

		if (saveTimerBtn) {
			saveTimerBtn.addEventListener('click', createNewTimer)
		}

		if (timerModal) {
			timerModal.addEventListener('click', e => {
				if (e.target === timerModal) {
					closeTimerModalFunc()
				}
			})
		}

		if (timerNameInput) {
			timerNameInput.addEventListener('keypress', e => {
				if (e.key === 'Enter') {
					createNewTimer()
				}
			})
		}
	}

	// ========== ОСНОВНЫЕ ОБРАБОТЧИКИ СОБЫТИЙ ==========

	checkboxes.forEach(checkbox => {
		checkbox.addEventListener('change', function () {
			updateDPForTask(this, this.checked)
			updateBPDisplays()
		})
	})

	x2ServerToggle.addEventListener('change', updateBPDisplays)
	vipToggle.addEventListener('change', updateBPDisplays)
	resetBtn.addEventListener('click', resetCheckboxes)

	counterButtons.forEach(btn => {
		btn.addEventListener('click', incrementCounter)
	})

	dpInput.addEventListener('change', saveProgress)
	dpInput.addEventListener('input', saveProgress)

	settingsBtn.addEventListener('click', () => {
		settingsModal.style.display = 'block'
		initializeSettingsModal()
	})

	closeSettings.addEventListener('click', () => {
		settingsModal.style.display = 'none'
	})

	// ========== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==========

	function initializeApp() {
		loadProgress()
		updateBPDisplays()
		updateTaskVisibility()
		initializePagination()
		initializeTimers()

		// Восстанавливаем таймеры после небольшой задержки, чтобы все элементы успели отрендериться
		setTimeout(() => {
			restoreRunningTimers()
		}, 500)
	}

	initializeApp()
})
