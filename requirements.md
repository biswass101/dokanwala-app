# Project: Smart Grocery Shop Management Mobile Application

## 1. Your Role

Act as a Senior Mobile Application Architect, Senior React Native Engineer, Senior Node.js Backend Engineer, Database Architect, UI/UX Designer, and Application Security Engineer.

Your responsibility is to design and develop a production-quality mobile application for managing a small grocery and convenience shop in Bangladesh.

Do not behave like a beginner-level code generator.

Think like an experienced software engineering team building a real commercial application that will be used daily by a non-technical shopkeeper.

Prioritize:

- Clean and maintainable architecture.
- Strong engineering principles.
- High security.
- Excellent mobile UI/UX.
- Reliable financial calculations.
- Data consistency.
- Offline functionality.
- Performance and scalability.
- Comprehensive testing.
- Clear documentation.

Do not sacrifice code quality for development speed.

---

## 2. Business Context

The application will be used to manage a small grocery/convenience shop in Bangladesh.

The shop sells products such as:

- Pan (পান)
- Supari (সুপারি)
- Jorda (জর্দা)
- Pan Masala (পান মশলা)
- Children's toys.
- Packaged grocery products.
- Other miscellaneous daily-use products.

Different products have different selling units.

Examples:

- Pan: piece, bundle.
- Supari: gram, kilogram, piece.
- Jorda: packet, container.
- Pan Masala: packet, piece.
- Toys: piece.
- Other products: piece, packet, weight, or other configurable units.

The application must support flexible product units and quantities.

It must be simple enough for a shopkeeper with limited technical experience.

### Primary UX requirements

- Mobile-first Android experience.
- Bangla-friendly interface.
- Large, accessible buttons.
- Minimal typing.
- Clear typography.
- Fast checkout.
- Simple navigation.
- Easy-to-understand financial information.
- Minimal unnecessary screens.
- Consistent design system.

Use BDT (৳) as the default currency.

---

## 3. Technology Stack

Use the following technologies unless a technical limitation requires a documented alternative.

### Mobile application

- React Native.
- Expo.
- TypeScript.
- Expo Router for navigation.
- NativeWind for styling, where appropriate.
- React Hook Form.
- Zod.
- TanStack Query for server-state management.
- Zustand for client-state management.
- Axios for API communication.
- Expo SQLite for local persistence.
- Expo SecureStore for sensitive local credentials.
- Appropriate Expo APIs for device functionality.

### Backend

- Node.js.
- Express.js.
- TypeScript.
- Prisma ORM.
- PostgreSQL.
- Zod for request validation.
- JWT-based authentication.
- Secure password/PIN hashing using Argon2id or an appropriate secure alternative.
- Structured logging.
- Centralized error handling.

IMPORTANT: Do not use NestJS.

### Development and quality tools

- ESLint.
- Prettier.
- TypeScript strict mode.
- Jest or Vitest for unit testing, where compatible.
- Supertest for backend API testing.
- React Native Testing Library for mobile component testing.
- Git and GitHub.
- Environment-based configuration.

Use stable, compatible package versions. Verify compatibility before installing dependencies.

Do not install unnecessary packages.

---

## 4. Architecture Principles

Follow professional software engineering principles.

### SOLID principles

Apply SOLID where it provides real architectural value.

### Clean Code

- Meaningful variable and function names.
- Small, focused functions.
- Single responsibility.
- Avoid unnecessary nesting.
- Avoid duplicated logic.
- Avoid magic numbers and unexplained strings.
- Avoid giant components and giant service files.
- Avoid unnecessary abstractions.

### Separation of concerns

Keep these responsibilities separate:

- UI components.
- Screens.
- Navigation.
- Hooks.
- State management.
- API clients.
- Business logic.
- Validation.
- Database operations.
- Authentication.
- Authorization.
- Error handling.

### Backend architecture

Use a modular Express architecture.

Suggested structure:

src/
  config/
  modules/
    auth/
    users/
    products/
    categories/
    inventory/
    sales/
    purchases/
    expenses/
    customers/
    suppliers/
    cashbook/
    reports/
  middlewares/
  shared/
    errors/
    utils/
    validators/
    types/
  database/
  app.ts
  server.ts

Each module should have clear responsibilities.

For example:

sales/
  sales.routes.ts
  sales.controller.ts
  sales.service.ts
  sales.repository.ts
  sales.schema.ts
  sales.types.ts

Do not force every module to use unnecessary layers. Keep the architecture consistent and manageable.

Controllers should handle HTTP concerns.

Services should contain business logic.

Repositories should handle data access when repository separation provides value.

Never place complex business logic directly inside Express route handlers.

### Mobile architecture

Suggested structure:

src/
  app/
  components/
  features/
    dashboard/
    products/
    inventory/
    sales/
    purchases/
    expenses/
    customers/
    suppliers/
    reports/
    settings/
  hooks/
  services/
  database/
  store/
  navigation/
  theme/
  utils/
  types/

Organize feature-specific components and logic together.

Avoid creating hundreds of unnecessary folders or files.

---

## 5. Core Application Modules

Implement the following business modules.

### Module 1: Dashboard

Display:

- Today's sales.
- Today's gross profit.
- Today's expenses.
- Today's net profit.
- Total products.
- Low-stock products.
- Customer outstanding dues.
- Recent transactions.

Provide quick actions:

- New Sale.
- Add Product.
- Purchase Stock.
- Add Expense.
- Collect Customer Payment.

Use simple, readable cards rather than overwhelming the shopkeeper with complex charts.

### Module 2: Sales Management

Build a fast POS-style checkout experience.

Features:

- Search products.
- Browse categories.
- Frequently sold products.
- Add products to cart.
- Change quantities.
- Remove cart items.
- Calculate subtotals.
- Apply discounts.
- Calculate final payable amount.
- Select payment method.
- Support cash, bKash, Nagad, and other configurable payment methods.
- Support partial payments.
- Support credit sales (বাকি).
- Save transaction history.
- View sale details.
- Generate receipts.
- Handle returns and cancellations.

The system must support different product measurement units.

Never assume all products are sold by pieces.

### Module 3: Product and Inventory Management

Product information should include:

- Product name in Bangla.
- Optional English name.
- Category.
- Optional image.
- Purchase price.
- Selling price.
- Current stock.
- Selling unit.
- Purchase unit.
- Unit conversion where necessary.
- Low-stock threshold.
- Optional supplier.
- Optional barcode.
- Active/inactive status.

Features:

- Create, update, view, and archive products.
- Stock adjustments.
- Stock movement history.
- Low-stock alerts.
- Damaged product tracking.
- Expired product tracking.
- Wastage tracking.
- Inventory valuation.

Special consideration:

Some products, such as fresh pan, may spoil.

Provide a way to record wastage so the financial reports remain accurate.

### Module 4: Purchase Management

Features:

- Create supplier purchases.
- Add multiple products to a purchase.
- Record quantities and unit costs.
- Calculate purchase totals.
- Record paid amounts.
- Track remaining supplier dues.
- Update inventory after successful purchase.
- View purchase history.
- Record purchase returns where applicable.

### Module 5: Expense Management

Support expense categories such as:

- Electricity.
- Rent.
- Transportation.
- Employee salary.
- Packaging.
- Maintenance.
- Other expenses.

Features:

- Add expenses.
- Edit expenses with proper audit history.
- View expense history.
- Filter by date and category.
- Record payment methods.

### Module 6: Profit and Loss

Implement accurate financial reporting.

Core formulas:

Gross Profit = Net Sales - Cost of Goods Sold

Net Profit = Gross Profit - Operating Expenses

Account for:

- Discounts.
- Sales returns.
- Purchase costs.
- Damaged stock.
- Wastage.
- Operating expenses.
- Customer credit.
- Partial payments.

IMPORTANT FINANCIAL RULES:

1. A credit sale is still a sale. Record its revenue when the sale occurs.
2. Collecting an outstanding customer payment must not create a second sale.
3. Customer payments must reduce outstanding receivables.
4. Supplier payments must reduce outstanding payables.
5. Historical sales must preserve the product cost at the time of sale.
6. Do not calculate historical profit using only the current product purchase price.
7. Use appropriate database transactions for financial operations.
8. Use decimal-safe monetary calculations. Never use JavaScript floating-point arithmetic carelessly for money.

Start with a clearly documented inventory costing method, such as weighted-average cost, and apply it consistently.

### Module 7: Customers and Suppliers

Customer features:

- Name.
- Optional phone number.
- Purchase history.
- Total purchases.
- Amount paid.
- Outstanding dues.
- Payment history.
- Customer ledger.

Supplier features:

- Name.
- Phone number.
- Purchase history.
- Total purchased.
- Amount paid.
- Outstanding payable.
- Payment history.
- Supplier ledger.

Do not require a customer account for every ordinary cash sale.

### Module 8: Reports, Settings, and Backup

Reports:

- Daily sales.
- Weekly sales.
- Monthly sales.
- Product-wise sales.
- Best-selling products.
- Purchases.
- Expenses.
- Profit and loss.
- Inventory.
- Customer dues.
- Supplier dues.
- Cashbook.

Settings:

- Shop name.
- Shop address.
- Shop logo.
- Currency.
- Language.
- Receipt configuration.
- User accounts.
- PIN/security settings.
- Backup and restore.

Provide CSV or Excel and PDF export where appropriate.

---

## 6. Offline-First Requirements

The shop must remain usable even when internet connectivity is unavailable.

Use Expo SQLite for local data persistence.

Expected behavior:

1. The shopkeeper can record a sale offline.
2. The sale is saved locally immediately.
3. The application shows the saved transaction.
4. The transaction is marked as pending synchronization.
5. When internet returns, the application synchronizes pending operations.
6. The server validates and stores the operation.
7. The local record is marked synchronized.
8. Failed synchronization can be retried safely.

Design synchronization carefully.

Requirements:

- Stable UUIDs for locally created records.
- Idempotency keys for financial operations.
- Retry handling.
- Duplicate prevention.
- Sync status tracking.
- Conflict detection.
- Server-authoritative financial calculations.
- Clear user feedback about pending synchronization.

Do not silently overwrite conflicting data.

Document the synchronization strategy before implementing it.

Do not pretend the application is offline-capable merely because it has SQLite.

Offline sales, inventory changes, and financial records must be handled consistently.

---

## 7. Database Design and Data Integrity

Use PostgreSQL with Prisma.

Create a normalized and maintainable relational database schema.

Potential entities:

- User.
- Shop.
- Category.
- Product.
- Unit.
- UnitConversion.
- InventoryBalance.
- StockMovement.
- Sale.
- SaleItem.
- Payment.
- Purchase.
- PurchaseItem.
- Expense.
- Customer.
- CustomerPayment.
- Supplier.
- SupplierPayment.
- CashbookEntry.
- AuditLog.
- SyncOperation.

These are starting suggestions, not a requirement to create unnecessary tables.

Before implementing the schema:

1. Analyze the business relationships.
2. Define primary keys and foreign keys.
3. Identify unique constraints.
4. Define indexes for frequently queried columns.
5. Decide how soft deletion will work.
6. Define transaction boundaries.
7. Explain how inventory quantities will be stored.
8. Explain how unit conversion will work.
9. Explain how financial records will remain historically accurate.

Use database transactions for operations involving multiple related records.

For example, a sale may need to:

- Create a sale.
- Create sale items.
- Record payments.
- Update stock.
- Create stock movements.
- Update customer dues.
- Record a cashbook entry.

These operations must not partially succeed.

Do not store sensitive or financial information in unvalidated free-form JSON when relational fields are more appropriate.

---

## 8. Security Requirements

Treat security as a core requirement, not a final development phase.

### Authentication

- Secure login.
- Secure PIN handling.
- Password/PIN hashing.
- JWT access tokens.
- Secure refresh-token strategy if implemented.
- Token expiration.
- Logout and token invalidation.
- Session management.

### Authorization

Implement role-based authorization.

Initially, support:

- Owner.
- Employee.

Even if the first release only has one user, keep authorization boundaries clear.

### API security

- Validate every request.
- Use Zod schemas.
- Prevent SQL injection through safe ORM usage.
- Prevent mass assignment.
- Implement rate limiting.
- Configure CORS explicitly.
- Use Helmet.
- Avoid exposing internal stack traces.
- Sanitize and validate user input.
- Protect sensitive endpoints.
- Enforce ownership and shop-level access on every relevant resource.

### Mobile security

- Store credentials securely.
- Never hardcode API keys or secrets.
- Do not expose private configuration in the mobile bundle.
- Avoid storing sensitive information unnecessarily.
- Protect local database access appropriately.
- Use HTTPS in production.

### Financial security

- Never trust client-calculated totals.
- Recalculate financial values on the server.
- Validate stock availability.
- Prevent duplicate payment processing.
- Use idempotency for sensitive operations.
- Maintain an audit trail for important changes.

Never claim a system is completely secure. Document remaining risks and mitigations.

---

## 9. UI/UX Requirements

Design the application for a real shopkeeper, not for a developer portfolio.

The interface must feel like a polished commercial application.

### Design direction

- Modern.
- Minimal.
- Professional.
- Clean.
- Consistent.
- Mobile-first.
- Accessible.

### Navigation

Use a simple bottom navigation structure.

Suggested tabs:

1. Home.
2. Sales.
3. Products.
4. Reports.
5. More.

Adjust if usability testing demonstrates a better structure.

### Design system

Establish reusable:

- Colors.
- Typography.
- Spacing.
- Border radius.
- Shadows.
- Buttons.
- Inputs.
- Cards.
- Modals.
- Bottom sheets.
- Loading states.
- Empty states.
- Error states.
- Success feedback.

### UX principles

- Avoid unnecessary typing.
- Make frequently used actions accessible.
- Use sensible defaults.
- Provide clear confirmation for destructive operations.
- Avoid confusing technical terminology.
- Show meaningful error messages in simple language.
- Support Bangla text properly.
- Make important numbers easy to read.
- Use accessible touch target sizes.
- Handle small-screen devices.
- Respect keyboard and safe-area behavior.

Do not use excessive gradients, unnecessary animations, or decorative elements that reduce usability.

Build a consistent design system before implementing all screens.

---

## 10. Testing Requirements

Testing is mandatory.

Do not consider a feature complete merely because it runs.

### Backend tests

Test:

- Authentication.
- Authorization.
- Request validation.
- Product CRUD.
- Inventory adjustments.
- Sales.
- Payments.
- Partial payments.
- Credit sales.
- Purchase operations.
- Supplier dues.
- Customer collections.
- Expenses.
- Profit calculations.
- Returns.
- Idempotency.
- Database transaction rollback.

### Mobile tests

Test:

- Navigation.
- Forms.
- Validation.
- Cart calculations.
- Checkout.
- Loading states.
- Error states.
- Empty states.
- Offline behavior.
- Synchronization states.

### Financial test cases

Include edge cases such as:

- Selling fractional quantities.
- Selling weighted products.
- Partial payments.
- Credit sales.
- Full payment collection later.
- Product returns.
- Damaged stock.
- Wastage.
- Discounts.
- Multiple payment methods.
- Insufficient inventory.
- Duplicate requests.

### Quality gates

Before declaring any phase complete:

- TypeScript compilation must pass.
- Linting must pass.
- Relevant tests must pass.
- No unexplained runtime errors.
- No known critical security issues.
- Documentation must be updated.

Do not hide failing tests or disable checks to make a phase appear complete.

---

## 11. Development Phases and Approval Workflow

This is one of the most important instructions.

Develop the application in clearly separated phases.

I will personally review, test, and commit each completed phase to GitHub.

You must NEVER implement all phases at once.

You must NEVER automatically continue to the next phase.

After completing each phase, stop and wait for my explicit approval.

### Phase 0 — Project Discovery and Architecture

Tasks:

- Inspect the existing repository, if one exists.
- Confirm the project requirements.
- Define mobile and backend architecture.
- Define folder structures.
- Define database architecture.
- Define offline synchronization strategy.
- Define API conventions.
- Define security architecture.
- Define design system.
- Prepare development roadmap.
- Create an implementation plan.

Deliverables:

- Architecture document.
- Database relationship diagram.
- Folder structure.
- API design conventions.
- Offline synchronization design.
- Development checklist.

Do not start full feature implementation yet.

STOP for my review and approval.

### Phase 1 — Project Foundation

Tasks:

- Initialize Expo React Native application.
- Initialize Node.js Express TypeScript backend.
- Configure PostgreSQL.
- Configure Prisma.
- Configure ESLint and Prettier.
- Configure TypeScript strict mode.
- Configure environment variables.
- Configure error handling.
- Configure logging.
- Configure API client.
- Configure navigation.
- Create initial design system.
- Establish Git-friendly project structure.

Deliverables:

- Running mobile application.
- Running backend.
- Working database connection.
- Health-check endpoint.
- Initial reusable UI components.
- README and setup instructions.

STOP for review, testing, and Git commit.

### Phase 2 — Authentication and Shop Setup

Tasks:

- Login.
- Owner account.
- Secure PIN/password handling.
- Authorization.
- Shop configuration.
- Session handling.
- Initial local database setup.

STOP for review, testing, and Git commit.

### Phase 3 — Product and Inventory Management

Tasks:

- Product categories.
- Product creation and editing.
- Flexible measurement units.
- Unit conversion.
- Stock tracking.
- Stock movements.
- Low-stock alerts.
- Wastage tracking.
- Inventory history.

STOP for review, testing, and Git commit.

### Phase 4 — Sales and POS

Tasks:

- Product search.
- Category navigation.
- Shopping cart.
- Quantity management.
- Discounts.
- Checkout.
- Multiple payment methods.
- Partial payments.
- Credit sales.
- Sales history.
- Receipt generation.
- Returns and cancellations.

STOP for review, testing, and Git commit.

### Phase 5 — Purchases and Suppliers

Tasks:

- Supplier management.
- Purchase entry.
- Multiple purchase items.
- Stock updates.
- Supplier payments.
- Outstanding supplier dues.
- Supplier ledger.

STOP for review, testing, and Git commit.

### Phase 6 — Customers and Expenses

Tasks:

- Customer management.
- Customer ledger.
- Customer payments.
- Outstanding dues.
- Expense categories.
- Expense management.
- Expense history.

STOP for review, testing, and Git commit.

### Phase 7 — Cashbook and Financial Reporting

Tasks:

- Daily cashbook.
- Opening cash.
- Cash sales.
- Cash expenses.
- Customer collections.
- Closing cash.
- Daily and monthly reports.
- Profit and loss.
- Inventory valuation.
- Product performance reports.

Verify all financial calculations with automated tests.

STOP for review, testing, and Git commit.

### Phase 8 — Offline Synchronization

Tasks:

- Local-first operations.
- Pending synchronization queue.
- Background synchronization.
- Idempotency.
- Conflict detection.
- Retry handling.
- Sync status indicators.
- Recovery from application termination.
- Data consistency testing.

STOP for review, testing, and Git commit.

### Phase 9 — Production Readiness

Tasks:

- Security review.
- Performance review.
- Database indexes.
- Error handling review.
- Backup and restore.
- Export functionality.
- App icon and splash screen.
- Android release configuration.
- Production API configuration.
- Final documentation.
- Release testing.

STOP for final approval.

Do not publish or deploy anything without my explicit authorization.

---

## 12. Git and Version Control Rules

I will manage GitHub commits after reviewing each phase.

Your responsibility is to prepare clean, reviewable changes.

After each phase:

1. Summarize what was implemented.
2. List important files created or modified.
3. Explain architectural decisions.
4. Explain how to run the code.
5. Provide testing commands.
6. Report actual test results.
7. Mention known limitations.
8. Identify security considerations.
9. Provide a suggested Git commit message.

Do not commit automatically.

Do not push to GitHub automatically.

Do not rewrite Git history.

Do not delete or overwrite existing user work without permission.

Keep changes focused on the current phase.

Suggested commit format:

feat(mobile): initialize expo application and design system

feat(backend): establish express api architecture

feat(inventory): implement product and stock management

fix(sales): prevent duplicate payment processing

refactor(database): improve inventory transaction handling

test(sales): add checkout and payment test coverage

---

## 13. AI Coding Agent Rules

Follow these rules throughout development.

1. First inspect the existing codebase before modifying it.
2. Never assume that a file or feature does not exist without checking.
3. Do not rewrite working code unnecessarily.
4. Do not generate giant files.
5. Do not duplicate business logic between screens.
6. Do not use `any` unless there is a documented and justified reason.
7. Avoid unnecessary dependencies.
8. Do not hardcode secrets.
9. Do not ignore TypeScript errors.
10. Do not suppress ESLint warnings without justification.
11. Do not use mock data as a substitute for real implementation.
12. Clearly distinguish implemented features from placeholders.
13. Do not silently change database schemas or remove data.
14. Use migrations for database schema changes.
15. Keep code readable and easy for another developer to understand.
16. Document complicated business logic.
17. Use reusable components where appropriate.
18. Keep API responses consistent.
19. Implement proper loading, error, and empty states.
20. Never claim a test passed unless you actually ran it.
21. Never claim a feature is complete if important requirements are missing.
22. Never proceed to another phase without my approval.

When a requirement is unclear, ask me before making a major architectural decision.

When you identify a better engineering approach, explain the trade-offs before changing the plan.

---

## 14. Required Phase Completion Report

At the end of every phase, produce this report:

### Phase Completion Report

**Phase:** [Phase number and name]

**Implemented:**
- List completed features.

**Architecture:**
- Explain important decisions.

**Files changed:**
- List important files.

**Database:**
- Explain schema or migration changes.

**Security:**
- Explain relevant security measures.

**Testing:**
- List commands executed.
- Report actual results.
- List failing or skipped tests.

**Manual testing checklist:**
- Give me practical steps to verify the feature.

**Known limitations:**
- List anything unfinished.

**Suggested Git commit:**
- Provide a concise commit message.

**Approval status:**
- Awaiting my review.

After this report, STOP.

Do not start the next phase until I explicitly say:

"Phase approved. Start the next phase."

---

## 15. First Action

Start with Phase 0 only.

Do not write the complete application immediately.

First inspect the repository and understand its current state.

Then prepare the architecture, database strategy, mobile architecture, backend architecture, offline synchronization approach, security plan, and phase-by-phase implementation checklist.

Ask me only the essential questions needed to finalize the architecture.

I want professional engineering quality, maintainable code, a beautiful and easy-to-use mobile experience, strong security, and reliable financial data.

Build this like a real production application, not a tutorial project.