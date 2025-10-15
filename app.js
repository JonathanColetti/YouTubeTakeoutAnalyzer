document.addEventListener('DOMContentLoaded', () => {
    const uploadSection = document.getElementById('upload-section');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('zip-upload');
    const statusContainer = document.getElementById('status-container');
    const statusText = document.getElementById('status-text');
    const dashboard = document.getElementById('dashboard');


    let topChannelsChart, hourlyActivityChart, monthlyHistoryChart;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) {
            handleFile(files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    /*
        * Main handler for uploads of zip files
        * Finds the required files and initates data and display
        * @param {File} file The ZIP file uploaded
        * @returns void if no problems 
    */
    async function handleFile(file) {
        if (!file.name.endsWith('.zip')) {
            alert('Please upload a valid .zip file.');
            return;
        }

        uploadSection.style.display = 'none';
        dashboard.style.display = 'none';
        statusContainer.style.display = 'flex';
        statusText.textContent = 'Reading ZIP file...';

        try {
            const zip = await JSZip.loadAsync(file);
            
            const historyFile = findFileInZip(zip, 'history/watch-history.html');
            const subsFile = findFileInZip(zip, 'subscriptions/subscriptions.csv');
            
            if (!historyFile) {
                throw new Error('Could not find watch-history.html in the ZIP file. Try a different part');
            }

            statusText.textContent = 'Parsing watch history...';
            const historyHtml = await historyFile.async('string');
            const watchHistory = parseWatchHistory(historyHtml);
            
            if (watchHistory.length === 0) {
                throw new Error('No watch history found. The HTML file might be empty or in an unrecognized format.');
            }

            let subscriptions = [];
            if (subsFile) {
                statusText.textContent = 'Parsing subscriptions...';
                const subsCsv = await subsFile.async('string');
                subscriptions = parseSubscriptions(subsCsv);
            }

            statusText.textContent = 'Analyzing data and creating charts...';
            analyzeAndDisplayData(watchHistory, subscriptions);

            statusContainer.style.display = 'none';
            dashboard.style.display = 'block';

        } catch (error) {
            console.error('Error processing file:', error);
            statusText.textContent = `Error: ${error.message}. Please check the console or try a different file.`;
            statusContainer.style.display = 'flex';
        }
    }

    function findFileInZip(zip, partialPath) {
        return zip.file(new RegExp(`.*${partialPath}$`))[0];
    }
    

    function parseWatchHistory(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const history = [];
        
        const contentCells = doc.querySelectorAll('.content-cell.mdl-cell--6-col.mdl-typography--body-1');

        contentCells.forEach(cell => {
            if (!cell.textContent.trim().startsWith('Watched')) {
                return;
            }

            try {
                // querying in 'cell' to avoid other links
                const links = cell.querySelectorAll('a');
                
                // A valid entry has a video + channel link
                if (links.length < 2) {
                    return; 
                }

                const videoLink = links[0];
                const channelLink = links[1];
                
                if (!channelLink.href.includes('youtube.com/channel')) {
                    return;
                }

                const videoTitle = videoLink.textContent.trim();
                const videoUrl = videoLink.href;
                const channelName = channelLink.textContent.trim();
                const channelUrl = channelLink.href;
                
                const htmlParts = cell.innerHTML.split('<br>');
                if (htmlParts.length < 3) return; 

                const dateString = htmlParts[2].trim();
                const cleanedDateString = dateString.replace(/, /g, ' ').replace(/ /g, ' ');
                const timestamp = new Date(cleanedDateString);

                if (videoTitle && channelName && !isNaN(timestamp.getTime())) {
                    history.push({ videoTitle, videoUrl, channelName, channelUrl, timestamp });
                }
            } catch (e) {
                console.warn("Could not parse an entry, skipping:", cell, e);
            }
        });
        return history;
    }

    function parseSubscriptions(csvString) {
        const result = Papa.parse(csvString, { header: true, skipEmptyLines: true });
        return result.data;
    }

    function analyzeAndDisplayData(history, subscriptions) {
        document.getElementById('total-videos').textContent = history.length.toLocaleString();
        document.getElementById('total-subscriptions').textContent = subscriptions.length.toLocaleString();
        
        const channelCounts = history.reduce((acc, item) => {
            acc[item.channelName] = (acc[item.channelName] || 0) + 1;
            return acc;
        }, {});
        document.getElementById('unique-channels').textContent = Object.keys(channelCounts).length.toLocaleString();

        const dayCounts = history.reduce((acc, item) => {
            const day = item.timestamp.toLocaleDateString('en-US', { weekday: 'long' });
            acc[day] = (acc[day] || 0) + 1;
            return acc;
        }, {});
        
        const dayEntries = Object.entries(dayCounts);
        const mostActiveDay = dayEntries.length > 0
            ? dayEntries.sort(([, a], [, b]) => b - a)[0][0]
            : 'N/A';
        document.getElementById('most-active-day').textContent = mostActiveDay;

        if (topChannelsChart) topChannelsChart.destroy();
        if (hourlyActivityChart) hourlyActivityChart.destroy();
        if (monthlyHistoryChart) monthlyHistoryChart.destroy();

        const sortedChannels = Object.entries(channelCounts).sort(([,a],[,b]) => b - a).slice(0, 10);
        topChannelsChart = new Chart(document.getElementById('top-channels-chart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: sortedChannels.map(ch => ch[0]),
                datasets: [{
                    label: 'Videos Watched',
                    data: sortedChannels.map(ch => ch[1]),
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: 'rgba(220, 38, 38, 1)',
                    borderWidth: 1
                }]
            },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }
        });

        const hourlyCounts = Array(24).fill(0);
        history.forEach(item => hourlyCounts[item.timestamp.getHours()]++);
        hourlyActivityChart = new Chart(document.getElementById('hourly-activity-chart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Videos Watched',
                    data: hourlyCounts,
                    backgroundColor: 'rgba(251, 113, 133, 0.6)',
                    borderColor: 'rgba(244, 63, 94, 1)',
                    borderWidth: 1
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        const monthlyCounts = {};
        history.forEach(item => {
            const monthKey = `${item.timestamp.getFullYear()}-${String(item.timestamp.getMonth()).padStart(2, '0')}`;
            monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
        });
        
        const sortedMonthKeys = Object.keys(monthlyCounts).sort();
        const monthLabels = sortedMonthKeys.map(key => {
            const [year, month] = key.split('-');
            return new Date(year, month).toLocaleDateString('en-US', { year: '2-digit', month: 'short'});
        });
        const monthData = sortedMonthKeys.map(key => monthlyCounts[key]);

        monthlyHistoryChart = new Chart(document.getElementById('monthly-history-chart').getContext('2d'), {
            type: 'line',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Videos Watched per Month',
                    data: monthData,
                    fill: true,
                    backgroundColor: 'rgba(252, 165, 165, 0.2)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
    }
});