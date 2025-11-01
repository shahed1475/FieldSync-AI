import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@otrix.com');
    await page.fill('input[name="password"]', 'Admin@2025!');
    await page.click('button[type="submit"]');

    // Wait for redirect to admin dashboard
    await page.waitForURL('/admin', { timeout: 10000 });
  });

  test('should navigate to admin dashboard successfully', async ({ page }) => {
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('h1')).toContainText(/dashboard|admin/i);
  });

  test('should display admin dashboard metrics', async ({ page }) => {
    await page.goto('/admin');

    // Check for metric cards
    await expect(page.locator('[data-testid="metric-card"]').first()).toBeVisible();

    // Verify key metrics are displayed
    const metricsText = await page.textContent('body');
    expect(metricsText).toMatch(/users|projects|revenue/i);
  });

  test.describe('Users Management', () => {
    test('should navigate to users page and display user list', async ({ page }) => {
      await page.goto('/admin/users');

      // Wait for users table to load
      await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

      // Verify table headers
      await expect(page.locator('text=/name|email|role/i').first()).toBeVisible();
    });

    test('should create a new user', async ({ page }) => {
      await page.goto('/admin/users');

      // Click create/add user button
      const createButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New User")').first();
      await createButton.click();

      // Fill user form
      await page.fill('input[name="name"], input[placeholder*="name" i]', 'Test User');
      await page.fill('input[name="email"], input[type="email"]', `testuser${Date.now()}@otrix.com`);
      await page.fill('input[name="password"], input[type="password"]', 'Test@2025!');

      // Select role if available
      const roleSelector = page.locator('select[name="role"], [role="combobox"]').first();
      if (await roleSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
        await roleSelector.click();
        await page.locator('text="User", text="user"').first().click();
      }

      // Submit form
      await page.click('button[type="submit"], button:has-text("Create"), button:has-text("Save")');

      // Wait for success message
      await expect(page.locator('text=/created|success/i')).toBeVisible({ timeout: 5000 });
    });

    test('should edit user role', async ({ page }) => {
      await page.goto('/admin/users');

      // Wait for table
      await page.waitForSelector('table, [role="table"]', { timeout: 10000 });

      // Click edit on first user (skip admin user if needed)
      const editButton = page.locator('button:has-text("Edit"), [aria-label*="edit" i]').nth(1);
      if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editButton.click();

        // Change role
        const roleSelector = page.locator('select[name="role"], [role="combobox"]').first();
        if (await roleSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
          await roleSelector.click();
          await page.locator('text="Admin", text="admin"').first().click();
        }

        // Save changes
        await page.click('button[type="submit"], button:has-text("Save"), button:has-text("Update")');

        // Wait for success
        await expect(page.locator('text=/updated|success/i')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should delete a user', async ({ page }) => {
      await page.goto('/admin/users');

      await page.waitForSelector('table, [role="table"]', { timeout: 10000 });

      // Find and click delete button (avoid deleting admin)
      const deleteButton = page.locator('button:has-text("Delete"), [aria-label*="delete" i]').last();
      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteButton.click();

        // Confirm deletion
        await page.click('button:has-text("Confirm"), button:has-text("Delete")');

        // Wait for success message
        await expect(page.locator('text=/deleted|removed|success/i')).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Projects Management', () => {
    test('should navigate to projects page', async ({ page }) => {
      await page.goto('/admin/projects');

      await expect(page.locator('h1, h2')).toContainText(/projects/i);
      await expect(page.locator('table, [role="table"], [data-testid*="project"]')).toBeVisible({ timeout: 10000 });
    });

    test('should create a new project', async ({ page }) => {
      await page.goto('/admin/projects');

      // Click create project button
      const createButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first();
      await createButton.click();

      // Fill project form
      await page.fill('input[name="name"], input[placeholder*="name" i]', 'Test Project E2E');
      await page.fill('textarea[name="description"], textarea[placeholder*="description" i]', 'Automated test project');

      // Select project type
      const typeSelector = page.locator('select[name="type"], [role="combobox"]').first();
      if (await typeSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
        await typeSelector.click();
        await page.locator('text="Web App", text="web"').first().click();
      }

      // Submit
      await page.click('button[type="submit"], button:has-text("Create")');

      // Wait for success
      await expect(page.locator('text=/created|success/i')).toBeVisible({ timeout: 5000 });
    });

    test('should display project status and progress', async ({ page }) => {
      await page.goto('/admin/projects');

      await page.waitForSelector('table, [role="table"]', { timeout: 10000 });

      // Check for status badges
      const statusBadges = page.locator('[class*="badge"], [data-testid*="status"]');
      if (await statusBadges.count() > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }

      // Check for progress indicators
      const progressBars = page.locator('[role="progressbar"], [class*="progress"]');
      if (await progressBars.count() > 0) {
        await expect(progressBars.first()).toBeVisible();
      }
    });

    test('should retry failed project', async ({ page }) => {
      await page.goto('/admin/projects');

      await page.waitForSelector('table, [role="table"]', { timeout: 10000 });

      // Look for retry button on failed projects
      const retryButton = page.locator('button:has-text("Retry"), [aria-label*="retry" i]').first();
      if (await retryButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await retryButton.click();

        // Wait for status change or success message
        await page.waitForTimeout(1000);
        await expect(page.locator('text=/retrying|queued|processing/i')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should view project logs', async ({ page }) => {
      await page.goto('/admin/projects');

      await page.waitForSelector('table, [role="table"]', { timeout: 10000 });

      // Click on logs/view button for first project
      const logsButton = page.locator('button:has-text("Logs"), button:has-text("View")').first();
      if (await logsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await logsButton.click();

        // Verify logs dialog/modal opens
        await expect(page.locator('[role="dialog"], [class*="modal"]')).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Subscriptions', () => {
    test('should display subscriptions list', async ({ page }) => {
      await page.goto('/admin/subscriptions');

      await expect(page.locator('h1, h2')).toContainText(/subscription/i);

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Check for subscription data or empty state
      const hasTable = await page.locator('table, [role="table"]').isVisible({ timeout: 2000 }).catch(() => false);
      const hasEmptyState = await page.locator('text=/no subscriptions|empty/i').isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasTable || hasEmptyState).toBe(true);
    });

    test('should display subscription plans', async ({ page }) => {
      await page.goto('/admin/subscriptions');

      await page.waitForTimeout(2000);

      // Check for plan badges/labels
      const pageContent = await page.textContent('body');
      const hasPlans = /free|pro|starter|professional|enterprise/i.test(pageContent || '');

      expect(hasPlans).toBe(true);
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between admin pages', async ({ page }) => {
      // Start at admin home
      await page.goto('/admin');

      // Navigate to users
      await page.click('a[href="/admin/users"], nav >> text="Users"');
      await expect(page).toHaveURL(/\/admin\/users/);

      // Navigate to projects
      await page.click('a[href="/admin/projects"], nav >> text="Projects"');
      await expect(page).toHaveURL(/\/admin\/projects/);

      // Navigate to subscriptions
      await page.click('a[href="/admin/subscriptions"], nav >> text="Subscriptions"');
      await expect(page).toHaveURL(/\/admin\/subscriptions/);

      // Go back to dashboard
      await page.click('a[href="/admin"], nav >> text="Dashboard"');
      await expect(page).toHaveURL(/\/admin$/);
    });
  });
});
