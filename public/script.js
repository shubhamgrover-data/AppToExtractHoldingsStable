
document.addEventListener('DOMContentLoaded', function() {
    const extractBtn = document.getElementById('extractBtn');
    const urlsTextarea = document.getElementById('urls');
    const attributeInput = document.getElementById('attribute');
    const labelInput = document.getElementById('label');
    const resultsSection = document.getElementById('results');
    const resultsContainer = document.getElementById('resultsContainer');
    const btnText = document.querySelector('.btn-text');
    const loader = document.querySelector('.loader');
    const endpointModeToggle = document.getElementById('endpointMode');

    // Set default URL and endpoint mode
    urlsTextarea.value = 'https://trendlyne.com/mutual-fund/nav/15630/parag-parikh-flexi-cap-direct-growth/';
    endpointModeToggle.checked = true;
    
    // Auto-load results for default URL
    autoLoadDefaultResults();

    extractBtn.addEventListener('click', async function() {
        let url = urlsTextarea.value.trim();
        const attribute = attributeInput.value.trim();
        const label = labelInput.value.trim();

        if (!url) {
            alert('Please enter a URL');
            return;
        }

        // Change 3: Format browser URL to endpoint format if needed
        try {
            new URL(url);
        } catch (_) {
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }
        }

        // Show loading state
        extractBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';
        resultsSection.style.display = 'none';

        try {
            const params = new URLSearchParams({
                url: url
            });
            
            if (attribute) {
                params.append('attribute', attribute);
            }
            
            if (label) {
                params.append('label', label);
            }

            const response = await fetch(`/api/extract-data?${params}`, {
                method: 'GET'
            });

            // Handle different response types (HTML or JSON)
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (response.ok) {
                displayEndpointResults([{ success: true, data: data, isHtml: !attribute }]);
            } else {
                const errorData = typeof data === 'string' ? { error: data } : data;
                throw new Error(errorData.error || 'Request failed');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        } finally {
            // Hide loading state
            extractBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    });

    function displayResults(results) {
        // This function is kept for compatibility but won't be called in single-URL mode
        resultsContainer.innerHTML = '';
    }

    // Allow Enter key to submit in input fields
    [urlsTextarea, attributeInput, labelInput].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                extractBtn.click();
            }
        });
    });

    async function autoLoadDefaultResults() {
        let defaultUrl = urlsTextarea.value.trim();
        const defaultAttribute = attributeInput.value.trim();
        
        if (defaultUrl) {
            // Show loading state briefly
            extractBtn.disabled = true;
            btnText.style.display = 'none';
            loader.style.display = 'block';
            
            try {
                // Ensure protocol for default URL
                if (!defaultUrl.startsWith('http')) {
                    defaultUrl = 'https://' + defaultUrl;
                }

                const params = new URLSearchParams({
                    url: defaultUrl
                });
                
                if (defaultAttribute) {
                    params.append('attribute', defaultAttribute);
                }
                
                if (labelInput.value.trim()) {
                    params.append('label', labelInput.value.trim());
                }

                const response = await fetch(`/api/extract-data?${params}`, {
                    method: 'GET'
                });

                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }

                if (response.ok) {
                    displayEndpointResults([{ success: true, data: data, isHtml: !defaultAttribute }]);
                }
            } catch (error) {
                console.log('Auto-load failed:', error.message);
            } finally {
                // Hide loading state
                extractBtn.disabled = false;
                btnText.style.display = 'block';
                loader.style.display = 'none';
            }
        }
    }

    function displayEndpointResults(results) {
        resultsContainer.innerHTML = '';
        
        const result = results[0]; // Change 2: Handle only one URL
        
        const endpointDiv = document.createElement('div');
        endpointDiv.className = 'endpoint-results';
        
        let displayContent = '';
        let copyContent = '';

        if (result.success) {
            if (result.isHtml) {
                // For HTML content, display a snippet and provide full copy
                displayContent = `<pre class="html-content" style="max-height: 500px; overflow: auto; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; text-align: left;">${escapeHtml(result.data.substring(0, 10000))}${result.data.length > 10000 ? '\n...[truncated]' : ''}</pre>`;
                copyContent = result.data;
            } else {
                displayContent = `<div class="json-data">${JSON.stringify(result.data, null, 2)}</div>`;
                copyContent = JSON.stringify(result.data, null, 2);
            }
        }

        endpointDiv.innerHTML = `
            <div class="endpoint-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0;">${result.isHtml ? 'HTML Response' : 'Endpoint Response'}</h3>
                <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(copyContent)}', this)">Copy ${result.isHtml ? 'HTML' : 'JSON'}</button>
            </div>
            ${displayContent}
        `;
        
        resultsContainer.appendChild(endpointDiv);
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
});

function copyToClipboard(text, button) {
    const unescapedText = text.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    navigator.clipboard.writeText(unescapedText).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.background = '#10b981';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#6366f1';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard');
    });
}

function escapeHtml(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
