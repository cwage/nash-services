/**
 * Select a service via the app's selectService function + trigger updateDateRange.
 * Replaces page.selectOption("#service-select", name) which no longer works
 * because the native select is hidden (replaced by custom combobox).
 */
async function pickService(page, serviceName) {
    await page.evaluate(async (name) => {
        selectService(name);
        await updateDateRange();
    }, serviceName);
}

module.exports = { pickService };
