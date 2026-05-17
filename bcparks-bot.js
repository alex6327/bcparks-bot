const { chromium } = require('playwright');

const CONFIG = {
    firstName: process.env.FIRST_NAME || 'Daniel',
    lastName: process.env.LAST_NAME || 'Zhang',
    email: process.env.EMAIL || 'your.email@example.com',
    parkName: process.env.PARK_NAME || 'Joffre Lakes Provincial Park',
    passType: process.env.PASS_TYPE || 'Trail Pass',
    targetDate: process.env.TARGET_DATE || '2026-05-18', 
    passCount: process.env.PASS_COUNT || '1',
    checkIntervalMs: (parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5) * 60 * 1000
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function checkApiAvailability() {
    const apiUrl = 'https://d757dzcblh.execute-api.ca-central-1.amazonaws.com/api/reservation?facility=Joffre%20Lakes&park=0363';
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://reserve.bcparks.ca',
                'Referer': 'https://reserve.bcparks.ca/'
            }
        });
        if (!response.ok) return false;
        const data = await response.json();
        const dateData = data[CONFIG.targetDate];
        if (!dateData) return false;
        return dateData.DAY?.capacity !== 'Full';
    } catch (error) {
        return false;
    }
}

async function launchBrowserAndBook() {
    console.log(`🚨 PASS OPEN! Launching stealth browser engine...`);
    
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            // CLOUDFLARE BYPASS: Suppresses the "navigator.webdriver" flag completely
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    // Create a highly realistic browser context window setup
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, refreshed) Chrome/124.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/Vancouver'
    });
    
    const page = await context.newPage();

    try {
        await page.goto('https://reserve.bcparks.ca/dayuse/registration', { waitUntil: 'networkidle' });

        // Step 1: Open Park Selection
        const targetBookButton = page.locator(`button[aria-label*="${CONFIG.parkName}"]`);
        await targetBookButton.click();
        await page.waitForLoadState('networkidle');

        // Step 2: Select Pass Type Dropdown
        const dropdownTrigger = page.locator('div, input, mat-select, .form-control').filter({ hasText: '--Select a pass type--' }).last();
        await dropdownTrigger.click();
        await page.waitForTimeout(600);

        const targetOption = page.locator(`[role="option"], mat-option, li, span, div`).filter({ hasText: CONFIG.passType }).first();
        await targetOption.click();
        await page.waitForTimeout(1000); 

        // Step 3: Choose Timing Window
        const timeSlots = ['All Day Pass', 'AM Pass', 'PM Pass', 'All Day', 'AM', 'PM'];
        for (const slot of timeSlots) {
            const slotLocator = page.locator(`button, div, label, input`).filter({ hasText: slot }).first();
            if (await slotLocator.isVisible()) {
                await slotLocator.click();
                break;
            }
        }
        await page.waitForTimeout(1000);

        // Step 4: Handle Quantity if displayed
        const nativeSelect = page.locator('select').first();
        if (await nativeSelect.isVisible()) {
            await nativeSelect.selectOption({ value: CONFIG.passCount });
        }
        await page.waitForTimeout(600);

       // ====================================================================
        // STEP 5: ADVANCE & HOLD FOR CLOUDFLARE INTERSTITIAL CHALLENGE
        // ====================================================================
        console.log('Clicking "Next". Standing by for Cloudflare verification barrier...');
        await page.click('button:has-text("Next")');
        
        // Wait for the network layer to calm down immediately following the click
        await page.waitForLoadState('networkidle').catch(() => {});

        // ====================================================================
        // STEP 6: DYNAMIC FORM WAITING (Bypasses rigid timers)
        // ====================================================================
        console.log('Waiting for Cloudflare to clear and render the checkout form...');
        
        try {
            // Give Cloudflare up to 30 seconds to run its background calculations and clear the path.
            // Playwright will poll the DOM dynamically and proceed the microsecond the input appears.
            await page.waitForSelector('input[name="firstName"]', { 
                state: 'visible', 
                timeout: 30000 
            });
            console.log('🛡️ Cloudflare cleared successfully! Proceeding to auto-fill fields...');
            
        } catch (timeoutError) {
            // If it fails here, it means Cloudflare threw a hard visual puzzle or blocked the IP
            throw new Error("Cloudflare challenge page did not clear within 30 seconds. Check the diagnostic snapshot.");
        }
        
        // Stagger inputs slightly to mimic natural human typing behavior after the barrier drops
        await page.fill('input[name="firstName"]', CONFIG.firstName);
        await page.waitForTimeout(400);
        
        await page.fill('input[name="lastName"]', CONFIG.lastName);
        await page.waitForTimeout(300);
        
        await page.fill('input[name="email"]', CONFIG.email);
        await page.waitForTimeout(400);
        
        await page.fill('input[name="confirmEmail"]', CONFIG.email);
        
        // PRECISION CHECKBOX SELECTION:
        // Instead of selecting all boxes, find the container element explicitly containing the core terms agreement string
        console.log('Accepting terms and conditions notice...');
        const agreementCheckbox = page.locator('div, label, mat-checkbox').filter({ hasText: 'I have read and agree to the above notice' }).locator('input[type="checkbox"]').first();
        
        if (await agreementCheckbox.count() > 0) {
            await agreementCheckbox.check({ force: true });
        } else {
            // High-resilience fallback selector if structure updates
            await page.locator('input[type="checkbox"]').last().check({ force: true });
        }

        console.log('🏁 Form ready!');
        // UNCOMMENT when you are completely ready to lock down booking confirmations automatically
        // await page.click('button:has-text("Submit")');
        console.log('🎉 Success! Form fields injected cleanly under stealth protocols.');

    } catch (error) {
        console.error('❌ Browser pipeline execution failed:', error.message);
        try {
            await page.screenshot({ path: `screenshots/claim-error-${Date.now()}.png`, fullPage: true });
        } catch (_) {}
    } finally {
        await browser.close();
        console.log(`[${new Date().toLocaleTimeString()}] Session wrapped. Sleeping...`);
    }
}

async function main() {
    while (true) {
        const isAvailable = await checkApiAvailability();
        if (isAvailable) {
            await launchBrowserAndBook();
            await delay(15 * 60 * 1000); 
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] API Check -> Date: ${CONFIG.targetDate} | Capacity: Full`);
            await delay(CONFIG.checkIntervalMs);
        }
    }
}

main();