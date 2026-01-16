// Configuration
const N8N_WEBHOOK_URL = 'https://n8ngc.codeblazar.org/webhook/935d0775-e13b-4364-a4a3-d2db575ba99b/chat';

// State
let events = JSON.parse(localStorage.getItem('wellUpEvents')) || [];
let currentMonth = new Date();

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const calendarGrid = document.getElementById('calendarGrid');
const monthYear = document.getElementById('monthYear');
const prevMonth = document.getElementById('prevMonth');
const nextMonth = document.getElementById('nextMonth');
const eventsList = document.getElementById('eventsList');

// Chat Event Listeners
sendButton.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Calendar Event Listeners
prevMonth.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
});

nextMonth.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
});

// Send message to N8N webhook
async function sendMessage() {
    const message = chatInput.value.trim();
    
    if (!message) return;

    // Display user message
    addMessageToChat(message, 'user');
    chatInput.value = '';

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    sendButton.disabled = true;

    try {
        // Get or create session ID for consistent conversation memory
        let sessionId = localStorage.getItem('wellup_sessionId');
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            localStorage.setItem('wellup_sessionId', sessionId);
        }

        // Send to N8N webhook
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chatInput: message,
                sessionId: sessionId,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Extract the response text from the output field
        let botResponse = typeof data === 'string' ? data : data.output || data.message || data.response || JSON.stringify(data);

        // Clean up verbose calendar API responses
        botResponse = cleanCalendarResponse(botResponse);

        // Display bot response
        addMessageToChat(botResponse, 'bot');

        // Check if the response contains date/event information
        parseAndCreateEvent(message, botResponse);        
        // Also try to extract event from successful bot response (e.g., from calendar API)
        extractEventFromBotResponse(botResponse);
    } catch (error) {
        console.error('Error:', error);
        addMessageToChat('Sorry, I had trouble connecting to my backend. Please try again!', 'bot');
    } finally {
        loadingIndicator.style.display = 'none';
        sendButton.disabled = false;
        chatInput.focus();
    }
}

// Clean up verbose calendar API responses
function cleanCalendarResponse(response) {
    // If response contains technical API data, extract just the meaningful message
    // Remove or minimize JSON-like content and excessive technical details
    
    // Remove tool execution information [Used tools: Tool: ... Input: ... Result: ...]
    let cleaned = response.replace(/\[Used tools:[\s\S]*?Result:\s*[\[\{][\s\S]*?[\]\}]\]\s*/g, '');
    
    // Remove event IDs and technical references like [{"id":"...", "etag":...}]
    cleaned = cleaned.replace(/\[\{[\s\S]*?"kind":"calendar#event"[\s\S]*?\}\]/g, '');
    cleaned = cleaned.replace(/\[\{[\s\S]*?"iCalUID":[\s\S]*?\}\]/g, '');
    
    // Remove inline technical references like (Ref: `xxx`)
    cleaned = cleaned.replace(/\s*\(Ref:\s*`[^`]+`\)\s*/g, '');
    
    // Remove success indicators like *[{"success":true}]*
    cleaned = cleaned.replace(/\*?\[\{"success":true\}\]\*?/g, '');
    
    // Clean up multiple spaces and extra newlines
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    cleaned = cleaned.trim();
    
    return cleaned;
}

// Add message to chat UI
function addMessageToChat(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const paragraphDiv = document.createElement('p');
    
    if (sender === 'bot') {
        // Format bot messages with proper spacing and structure
        paragraphDiv.innerHTML = formatBotMessage(text);
    } else {
        // User messages are plain text
        paragraphDiv.textContent = text;
    }
    
    messageDiv.appendChild(paragraphDiv);
    chatMessages.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Format bot messages with proper spacing and bullet points
function formatBotMessage(text) {
    // Escape HTML to prevent XSS
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    // Split by multiple line breaks first (paragraph breaks)
    const paragraphs = escaped.split(/\n\s*\n/);
    
    let formatted = paragraphs.map(paragraph => {
        paragraph = paragraph.trim();
        
        // Check if this paragraph is a numbered list
        if (/^\d+\.\s/.test(paragraph)) {
            const items = paragraph.split(/\n(?=\d+\.)/);
            const listItems = items.map(item => {
                const match = item.match(/^(\d+\.\s+)(.*?)$/s);
                if (match) {
                    const number = match[1];
                    const content = match[2].trim();
                    // Check if content has sub-bullets (indented lines)
                    const subItems = content.split(/\n\s+(?=[•\-\*]|\d+\.)/).filter(s => s.trim());
                    
                    if (subItems.length > 1) {
                        const mainLine = subItems[0];
                        const bullets = subItems.slice(1).map(bullet => {
                            return `<span style="display: block; margin-left: 20px; margin-top: 5px;">• ${bullet.replace(/^[•\-\*]\s*/, '')}</span>`;
                        }).join('');
                        
                        return `<span style="display: block; margin: 12px 0;"><strong>${number}</strong>${mainLine}${bullets}</span>`;
                    } else {
                        return `<span style="display: block; margin: 12px 0;"><strong>${number}</strong>${content}</span>`;
                    }
                }
                return `<span style="display: block; margin: 12px 0;">${item}</span>`;
            }).join('');
            
            return `<div style="margin: 15px 0;">${listItems}</div>`;
        }
        
        // Check if this is a section with sub-items (like "2. The 'Brain Dump' (Mental Overload)")
        if (/^[A-Za-z0-9]+\.?\s+[\s\S]*?(?=\n[A-Za-z0-9]+\.|\n\n|$)/.test(paragraph)) {
            // Check for lines starting with a dash or bullet
            const lines = paragraph.split('\n');
            let formatted = '';
            let inSublist = false;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                if (/^[•\-\*\d+]\s+/.test(line)) {
                    // This is a list item
                    const cleanedLine = line.replace(/^[•\-\*\d+\.\s]+/, '');
                    formatted += `<span style="display: block; margin-left: 20px; margin-top: 8px;">• ${cleanedLine}</span>`;
                    inSublist = true;
                } else {
                    if (inSublist) {
                        formatted += '<br>';
                        inSublist = false;
                    }
                    formatted += `<span style="display: block; margin: 8px 0;">${line}</span>`;
                }
            }
            
            return `<div style="margin: 15px 0;">${formatted}</div>`;
        }
        
        // Regular paragraph with possible line breaks
        const lines = paragraph.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
            return lines.map(line => `<span style="display: block; margin: 8px 0;">${line.trim()}</span>`).join('');
        }
        
        return `<span style="display: block; margin: 12px 0;">${paragraph}</span>`;
    }).join('');
    
    return formatted;
}

// Extract event from successful bot response (when calendar API creates events)
function extractEventFromBotResponse(response) {
    // Look for patterns like "I've scheduled", "I've added", "I have scheduled", etc.
    // Extract title
    let titleMatch = response.match(/(?:I've|I have)\s+(?:scheduled|added|created)\s+(?:the\s+)?"([^"]+)"/i);
    if (!titleMatch) {
        titleMatch = response.match(/\*\*Title:\*\*\s*([^\n*]+)/i);
    }
    
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Extract date - look for patterns like "Saturday, January 17, 2026" or with day names
    let dateMatch = response.match(/(?:(?:Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
    
    if (!dateMatch) {
        // Try alternative pattern without day name: "January 17, 2026"
        dateMatch = response.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
    }

    if (title && dateMatch) {
        const monthName = dateMatch[1];
        const day = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);

        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());

        if (monthIndex !== -1) {
            // Create ISO date string directly without timezone conversion
            const monthStr = String(monthIndex + 1).padStart(2, '0');
            const dayStr = String(day).padStart(2, '0');
            const dateStr = `${year}-${monthStr}-${dayStr}`;

            // Check if event already exists
            const eventExists = events.some(e => e.date === dateStr && e.title === title);
            
            if (!eventExists) {
                const event = {
                    id: Date.now(),
                    date: dateStr,
                    title: title,
                    createdAt: new Date().toISOString(),
                };
                
                events.push(event);
                localStorage.setItem('wellUpEvents', JSON.stringify(events));
                
                // Update calendar display
                renderCalendar();
                renderEventsList();
            }
        }
    }

    // Check if bot deleted events
    if (response.toLowerCase().includes('delete') && (response.toLowerCase().includes('all events') || response.toLowerCase().includes('event'))) {
        events = [];
        localStorage.setItem('wellUpEvents', JSON.stringify(events));
        renderCalendar();
        renderEventsList();
    }
}

// Parse messages and create events if date is mentioned
function parseAndCreateEvent(userMessage, botResponse) {
    // Regular expressions to match dates with ordinal numbers (17th, 1st, etc.)
    const datePatterns = [
        /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/i,
        /(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/,
        /(?:on\s+)?(\d{1,2}-\d{1,2}-\d{2,4})/,
        /(?:next\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
        /(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)(?!\d)/i,
    ];

    // Check for event keywords in user message
    const eventKeywords = ['schedule', 'add', 'create', 'plan', 'event', 'meeting', 'appointment', 'reminder', 'task', 'study', 'exercise', 'break', 'meditation'];
    const hasEventKeyword = eventKeywords.some(keyword => userMessage.toLowerCase().includes(keyword));

    if (!hasEventKeyword) return;

    // Try to extract date and title
    for (let pattern of datePatterns) {
        const match = userMessage.match(pattern);
        if (match) {
            // Handle different date formats
            let dateStr = null;
            
            // Format: "17th of January 2026" or "17 January 2026"
            if (match[1] && !isNaN(match[1])) {
                const day = parseInt(match[1]);
                const monthStr = match[2];
                const year = match[3];
                
                if (monthStr && year) {
                    dateStr = `${monthStr} ${day} ${year}`;
                }
            }
            // Format: "January 17, 2026" (original format)
            else if (match[1] && isNaN(match[1])) {
                const monthStr = match[1];
                const day = parseInt(match[2]);
                const year = match[3];
                
                if (year) {
                    dateStr = `${monthStr} ${day} ${year}`;
                }
            }

            const title = extractEventTitle(userMessage);
            const timeInfo = extractTimeInfo(userMessage);
            
            if (dateStr && title) {
                createEventFromUserMessage(dateStr, title, timeInfo);
                return;
            }
        }
    }

    // If specific date format wasn't found, try to be more flexible
    if (userMessage.toLowerCase().includes('today')) {
        const title = extractEventTitle(userMessage);
        const timeInfo = extractTimeInfo(userMessage);
        if (title) {
            const today = new Date();
            const dateStr = `${getMonthName(today.getMonth())} ${today.getDate()} ${today.getFullYear()}`;
            createEventFromUserMessage(dateStr, title, timeInfo);
        }
    }
}


// Extract time information from user message (e.g., "5pm to 6pm" or "5:00 PM - 6:00 PM")
function extractTimeInfo(message) {
    // Match patterns like "5pm to 6pm", "5:00 PM - 6:00 PM", etc.
    const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|AM|PM)\s+(?:to|-|until)\s+(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|AM|PM)/i);
    
    if (timeMatch) {
        return message.substring(timeMatch.index, timeMatch.index + timeMatch[0].length);
    }
    
    return null;
}

// Get month name from month index
function getMonthName(monthIndex) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthIndex];
}

// Create event directly from user message (with proper date parsing)
function createEventFromUserMessage(dateStr, title, timeInfo) {
    const dateISO = parseEventDateStringToISO(dateStr);
    
    if (dateISO) {
        const event = {
            id: Date.now(),
            date: dateISO,
            title: title,
            time: timeInfo || '',
            createdAt: new Date().toISOString(),
        };
        
        events.push(event);
        localStorage.setItem('wellUpEvents', JSON.stringify(events));
        
        // Update calendar and events list
        renderCalendar();
        renderEventsList();
        
        // Show confirmation
        const confirmMsg = timeInfo ? 
            `✅ I've added "${title}" to your calendar on ${dateStr} from ${timeInfo}!` :
            `✅ I've added "${title}" to your calendar on ${dateStr}!`;
        addMessageToChat(confirmMsg, 'bot');
    }
}

// Parse date string like "January 17 2026" and return ISO date string (YYYY-MM-DD) - avoids timezone issues
function parseEventDateStringToISO(dateStr) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Match "Month Day Year" format
    const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
    if (match) {
        const monthName = match[1];
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        
        const monthIndex = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
        if (monthIndex !== -1) {
            // Create ISO date string directly to avoid timezone issues
            const monthStr = String(monthIndex + 1).padStart(2, '0');
            const dayStr = String(day).padStart(2, '0');
            return `${year}-${monthStr}-${dayStr}`;
        }
    }
    
    return null;
}

// Parse date string like "January 17 2026" to Date object
function parseEventDateFromString(dateStr) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Match "Month Day Year" format
    const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
    if (match) {
        const monthName = match[1];
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        
        const monthIndex = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
        if (monthIndex !== -1) {
            return new Date(year, monthIndex, day);
        }
    }
    
    return null;
}
function extractEventTitle(message) {
    // First, try to extract title after "titled" keyword (case-insensitive, handles "Tilted" too)
    const titledMatch = message.match(/[Tt]itled\s+["']?([^",.\n?!]+?)["']?(?:\s+from|\s+at|,|\.|\n|$)/i);
    if (titledMatch) {
        let title = titledMatch[1].trim();
        // Remove any remaining "from" time information
        title = title.replace(/\s+from\s+.*/i, '').trim();
        return title.substring(0, 50);
    }

    // Try to extract from "event [title]" pattern
    const eventMatch = message.match(/(?:event|activity|task)\s+(?:called\s+|named\s+|titled\s+)?["']?([^",.\n?!]+)["']?(?:[,.\n?!]|$)/i);
    if (eventMatch) {
        return eventMatch[1].trim().substring(0, 50);
    }

    // Remove date-related patterns and extract remaining meaningful text
    let title = message
        .replace(/(?:can you\s+|could you\s+|please\s+)?(?:schedule|add|create|plan|set up)\s+(?:an\s+event\s+)?(?:for\s+)?/i, '')
        .replace(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi, '')
        .replace(/(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/g, '')
        .replace(/(?:on\s+)?(\d{1,2}-\d{1,2}-\d{2,4})/g, '')
        .replace(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+\d{4})?/gi, '')
        .replace(/(?:next\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/gi, '')
        .replace(/(?:from\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/gi, '')
        .replace(/\?.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return title.substring(0, 50) || 'Event'; // Limit title length
}

// Create event and save to localStorage
function createEvent(dateStr, title) {
    const eventDate = parseEventDate(dateStr);
    
    if (eventDate) {
        const event = {
            id: Date.now(),
            date: eventDate.toISOString().split('T')[0],
            title: title,
            createdAt: new Date().toISOString(),
        };
        
        events.push(event);
        localStorage.setItem('wellUpEvents', JSON.stringify(events));
        
        // Update calendar and events list
        renderCalendar();
        renderEventsList();
    }
}

// Parse various date formats
function parseEventDate(dateStr) {
    // Try MM/DD/YYYY or MM-DD-YYYY format
    const slashMatch = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (slashMatch) {
        let month = parseInt(slashMatch[1]) - 1;
        let day = parseInt(slashMatch[2]);
        let year = parseInt(slashMatch[3]);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
    }

    // Try "Month DD" format
    const monthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
    if (monthMatch) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = months.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase());
        const day = parseInt(monthMatch[2]);
        const year = new Date().getFullYear();
        return new Date(year, month, day);
    }

    // Try day of week
    const dayMatch = dateStr.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
    if (dayMatch) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayIndex = days.findIndex(d => d.toLowerCase() === dayMatch[1].toLowerCase());
        const today = new Date();
        const todayIndex = today.getDay();
        let date = new Date(today);
        let diff = dayIndex - todayIndex;
        if (diff <= 0) diff += 7;
        date.setDate(date.getDate() + diff);
        return date;
    }

    // Try DD (current month)
    const dayOnlyMatch = dateStr.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
    if (dayOnlyMatch) {
        const day = parseInt(dayOnlyMatch[1]);
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), day);
    }

    return null;
}

// Format date as MM/DD/YYYY
function formatDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

// Render calendar
function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    monthYear.textContent = `${monthNames[month]} ${year}`;

    // Clear calendar grid
    calendarGrid.innerHTML = '';

    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Add previous month's days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.textContent = daysInPrevMonth - i;
        calendarGrid.appendChild(dayDiv);
    }

    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.textContent = day;

        // Check if this day has events
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = events.some(e => e.date === dateStr);
        
        if (hasEvent) {
            dayDiv.classList.add('has-event');
        }

        calendarGrid.appendChild(dayDiv);
    }

    // Add next month's days
    const totalCells = calendarGrid.children.length - 7; // Subtract day headers
    const remainingCells = 42 - totalCells; // 6 rows × 7 days
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.textContent = day;
        calendarGrid.appendChild(dayDiv);
    }

    renderEventsList();
}

// Render events list
function renderEventsList() {
    if (events.length === 0) {
        eventsList.innerHTML = '<p class="no-events">No events yet. Create one by chatting with your buddy!</p>';
        return;
    }

    // Sort events by date - use ISO comparison to avoid timezone issues
    const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

    // Filter events to show only upcoming or recent ones
    // Use ISO date string comparison for today to avoid timezone shifts
    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const futureEvents = sortedEvents.filter(event => {
        return event.date >= todayISO;
    });

    const pastEvents = sortedEvents.filter(event => {
        return event.date < todayISO;
    }).slice(-2); // Show last 2 past events

    eventsList.innerHTML = '';

    if (futureEvents.length > 0) {
        futureEvents.forEach(event => {
            const eventDiv = createEventElement(event);
            eventsList.appendChild(eventDiv);
        });
    }

    if (pastEvents.length > 0 && futureEvents.length > 0) {
        const separator = document.createElement('div');
        separator.style.borderTop = '1px solid #ddd';
        separator.style.margin = '10px 0';
        eventsList.appendChild(separator);
    }

    if (pastEvents.length > 0) {
        pastEvents.reverse().forEach(event => {
            const eventDiv = createEventElement(event, true);
            eventsList.appendChild(eventDiv);
        });
    }

    if (futureEvents.length === 0 && pastEvents.length === 0) {
        eventsList.innerHTML = '<p class="no-events">No events yet. Create one by chatting with your buddy!</p>';
    }
}

// Create event element
function createEventElement(event, isPast = false) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-item';
    
    // Parse ISO date string without timezone conversion
    const [year, month, day] = event.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    // Format date using local timezone only (no UTC conversion)
    const formattedDate = dateObj.toLocaleDateString('en-SG', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    const dateDiv = document.createElement('div');
    dateDiv.className = 'event-date';
    dateDiv.textContent = formattedDate + (isPast ? ' (past)' : '');

    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';
    titleDiv.textContent = event.title;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'event-time';
    timeDiv.style.fontSize = '0.85em';
    timeDiv.style.color = '#666';
    timeDiv.style.marginTop = '4px';
    timeDiv.textContent = event.time || '';

    eventDiv.appendChild(dateDiv);
    eventDiv.appendChild(titleDiv);
    if (event.time) {
        eventDiv.appendChild(timeDiv);
    }

    return eventDiv;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
    chatInput.focus();
});
