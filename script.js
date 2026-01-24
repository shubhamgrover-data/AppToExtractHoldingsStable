document.addEventListener("DOMContentLoaded", function () {
    const extractBtn = document.getElementById("extractBtn");
    const urlsTextarea = document.getElementById("urls");
    const attributeInput = document.getElementById("attribute");
    const attributeValue = document.getElementById("attributeValue");
    const proxyUrlInput = document.getElementById("proxyUrl");
    const resultsSection = document.getElementById("results");
    const resultsContainer = document.getElementById("resultsContainer");
    const btnText = document.querySelector(".btn-text");
    const loader = document.querySelector(".loader");
    const endpointModeToggle = document.getElementById("endpointMode");

    // Set default URL and endpoint mode
    urlsTextarea.value =
        "https://trendlyne.com/mutual-fund/nav/15630/parag-parikh-flexi-cap-direct-growth/";
    endpointModeToggle.checked = true;

    // Auto-load results for default URL
    autoLoadDefaultResults();

    extractBtn.addEventListener("click", async function () {
        const urlsText = urlsTextarea.value.trim();
        const attribute = attributeInput.value.trim();
        const attributeValue = attributeValue.value.trim();
        const label = "";
        const proxyUrl = proxyUrlInput.value.trim();

        if (!urlsText) {
            alert("Please enter at least one URL");
            return;
        }

        if (!attribute) {
            alert("Please enter a target attribute");
            return;
        }

        const urls = urlsText
            .split("\n")
            .map((url) => url.trim())
            .filter((url) => url);

        // Show loading state
        extractBtn.disabled = true;
        btnText.style.display = "none";
        loader.style.display = "block";
        resultsSection.style.display = "none";

        try {
            const results = await extractDataFromUrls(
                urls,
                attribute,
                attributeValue,
                proxyUrl,
            );

            if (endpointModeToggle.checked) {
                displayEndpointResults(results);
            } else {
                displayResults(results);
            }
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            // Hide loading state
            extractBtn.disabled = false;
            btnText.style.display = "block";
            loader.style.display = "none";
        }
    });

    async function extractDataFromUrls(
        urls,
        attribute,
        attributeValue,
        proxyUrl,
    ) {
        const results = [];

        for (const url of urls) {
            try {
                const targetUrl = proxyUrl ? proxyUrl + url : url;
                console.log(targetUrl);
                const response = await fetch(
                    targetUrl +
                        `?attribute=${attribute}&attributeValue=${attributeValue}`,
                    {
                        method: "GET",
                        headers: {
                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                        },
                    },
                );

                console.log(response);

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`,
                    );
                }

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");

                // Find element with the specified attribute
                const element = doc.querySelector(`[${attribute}]`);

                if (element) {
                    const attrValue = element.getAttribute(attribute);

                    if (attrValue) {
                        try {
                            const jsonData = JSON.parse(attrValue);
                            results.push({
                                url,
                                success: true,
                                data: jsonData,
                                attribute: attribute,
                                rawValue: attrValue,
                            });
                        } catch (parseError) {
                            results.push({
                                url,
                                success: true,
                                data: null,
                                attribute: attribute,
                                rawValue: attrValue,
                                parseError: "Could not parse as JSON",
                            });
                        }
                    } else {
                        results.push({
                            url,
                            success: false,
                            error: `Attribute "${attribute}" not found`,
                        });
                    }
                } else {
                    results.push({
                        url,
                        success: false,
                        error: `Element with attribute "${attribute}" not found`,
                    });
                }
            } catch (error) {
                results.push({
                    url,
                    success: false,
                    error: error.message,
                });
            }
        }

        return results;
    }

    function displayResults(results) {
        resultsContainer.innerHTML = "";

        results.forEach((result, index) => {
            const resultDiv = document.createElement("div");
            resultDiv.className = `result-item ${result.success ? "success" : "error"}`;

            let content = `
                <div class="result-url">URL ${index + 1}: ${result.url}</div>
                <div class="result-status ${result.success ? "success" : "error"}">
                    ${result.success ? "✅ Success" : "❌ Error"}
                </div>
            `;

            if (result.success) {
                if (result.data) {
                    content += `
                        <div>
                            <strong>Extracted Data:</strong>
                            <div class="json-data">${JSON.stringify(result.data, null, 2)}</div>
                            
                        </div>
                    `;
                } else {
                    content += `
                        <div>
                            <strong>Raw Value:</strong>
                            <div class="json-data">${result.rawValue}</div>
                            ${result.parseError ? `<div class="error-message">${result.parseError}</div>` : ""}
                        </div>
                    `;
                }
            } else {
                content += `<div class="error-message">${result.error}</div>`;
            }

            resultDiv.innerHTML = content;
            resultsContainer.appendChild(resultDiv);
        });

        resultsSection.style.display = "block";
        resultsSection.scrollIntoView({ behavior: "smooth" });
    }

    function displayEndpointResults(results) {
        resultsContainer.innerHTML = "";

        const endpointDiv = document.createElement("div");
        endpointDiv.className = "endpoint-results";

        const endpointData = results
            .filter((result) => result.success && result.data)
            .map((result) => result.data);

        const finalData =
            endpointData.length === 1 ? endpointData[0] : endpointData;

        endpointDiv.innerHTML = `
            <div class="endpoint-header">
                <h3>Endpoint Response</h3>
                
            </div>
            <div class="json-data">${JSON.stringify(finalData, null, 2)}</div>
        `;

        resultsContainer.appendChild(endpointDiv);
        resultsSection.style.display = "block";
        resultsSection.scrollIntoView({ behavior: "smooth" });
    }

    async function autoLoadDefaultResults() {
        const defaultUrl = urlsTextarea.value.trim();
        const defaultAttribute = attributeInput.value.trim();
        const proxyUrl = proxyUrlInput.value.trim();

        if (defaultUrl && defaultAttribute) {
            extractBtn.disabled = true;
            btnText.style.display = "none";
            loader.style.display = "block";
            console.log(proxyUrl);
            try {
                const results = await extractDataFromUrls(
                    [defaultUrl],
                    defaultAttribute,
                    labelInput.value.trim(),
                    proxyUrl,
                );

                if (results.length > 0 && results[0].success) {
                    displayEndpointResults(results);
                }
            } catch (error) {
                console.log("Auto-load failed:", error.message);
            } finally {
                extractBtn.disabled = false;
                btnText.style.display = "block";
                loader.style.display = "none";
            }
        }
    }

    // Allow Enter key to submit in input fields
    [urlsTextarea, attributeInput, labelInput].forEach((input) => {
        input.addEventListener("keypress", function (e) {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                extractBtn.click();
            }
        });
    });
});

function copyToClipboard(text, button) {
    const unescapedText = text.replace(/\\"/g, '"').replace(/\\n/g, "\n");
    navigator.clipboard
        .writeText(unescapedText)
        .then(() => {
            const originalText = button.textContent;
            button.textContent = "Copied!";
            button.style.background = "#10b981";
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = "#6366f1";
            }, 2000);
        })
        .catch((err) => {
            console.error("Failed to copy: ", err);
            alert("Failed to copy to clipboard");
        });
}

function escapeHtml(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
