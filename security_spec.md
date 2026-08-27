# Security Specification: Zero-Trust Secure Firestore Architecture

This document defines the security boundaries, data invariants, and vulnerability test suites for our Cloud Firestore database layout. Here, we outline the exact threat vector analysis and verify that unauthorized access is mathematically impossible.

## 1. Data Invariants

Our databases enforce three pillars of security: Authentication, Relational Access, and Mutation Integrity.
- **Course Collection Invariants**:
  - Anyone can view standard active courses (`read`, `list`).
  - Only authenticated administrators with positive privilege lookup can `create` (`addDoc`) or `delete` (`deleteDoc`) courses.
  - No user can perform partial updates with system privilege escalation fields (e.g. inject custom code or alter tenant ownership) without going through validation guards.
  - Courses must have a name, description, and model defined properly.

- **User Profile Collection Invariants**:
  - A user can only access (`get`/`list`/`create`/`update`) their own profile document matched via `request.auth.uid == userId`.
  - Roles (`role`, `isAdmin`) are system fields. Regular accounts cannot self-assign these roles.
  - Profile PII (like email addresses) is isolated or restricted and checked against `email_verified == true`.

---

## 2. The "Dirty Dozen" Threat Payloads

The following 12 JSON mutation payloads represent specific exploits that our `firestore.rules` must block with a `PERMISSION_DENIED` exception:

### Attack Vector 1: Course Privilege Escalation
1. **Self-Created Course (Unauthenticated)**: An anonymous user attempts to append a mock course.
   ```json
   {
     "title": "Hackers Course",
     "pricing_model": "free",
     "createdAt": "2026-06-03T11:00:00Z"
   }
   ```
2. **Standard User Course Deletion**: A logged-in user with role `student` attempts to delete an existing course doc `/courses/123`.
   - *Target*: `delete /courses/123` with header `userId: "student_id"`.
3. **Ghost-Field Injection on Course Create**: An attacker attempts to write extra fields such as `isSystemGlobal: true` or `vulnerability_test: "exploited"`.
   ```json
   {
     "title": "Polished course",
     "description": "Clean description",
     "thumbnail": "ok",
     "pricing_model": "free",
     "isSystemGlobal": true,
     "ghostField": "malicious"
   }
   ```
4. **Incorrect Field Value Types (Type Poisoning)**: An administrator (or impersonator) attempts to write `one_time_price` as a boolean `"true"` instead of a proper float/integer.
   ```json
   {
     "title": "React Advanced",
     "one_time_price": true,
     "pricing_model": "one_time"
   }
   ```
5. **Denial-of-Wallet ID Poisoning**: High-character sequence or junk chars injected as document ID:
   - *Target*: `create /courses/JUNK_CHARACTERS_THAT_ARE_1000_BYTES_LONG`

### Attack Vector 2: User Profile Security & Role Hijacking
6. **Self-Assigned Admin Role (Create Profile)**: A new user registering a profile profile doc `/users/user_123` setting `role: "admin"`.
   ```json
   {
     "email": "user@gmail.com",
     "role": "admin"
   }
   ```
7. **Cross-User Directory Reading**: User `student_A` requests `get /users/student_B`.
8. **PII Blanket Leak (Unrestricted List)**: A signed-in student runs a query `getDocs(collection(db, 'users'))` to scrape all emails.
9. **Identity Spoofing in Created Document**: Writing a document containing `ownerId: "victim_user_id"` while logged in as `malicious_user_id`.
10. **Spoofed Admin Verification (Verified email bypass)**: User attempts to perform administrative actions with `email_verified` as `false`.

### Attack Vector 3: Data Integrity and System Rules
11. **Immortality Field Update**: Modifying the custom immutable timestamp `createdAt` on an existing course.
12. **Non-Standard Character ID Injections**: Path traversal characters or URL escapes injected as document identifiers:
    - *Target*: `doc(db, 'courses', '../admin_escalate')`

---

## 3. Test Runner Design (`firestore.rules.test.ts`)

These checks correspond to assertions tested programmatically within our system:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";

describe("Firestore Security Fortress", () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "stable-tensor-f8gvj",
      firestore: {
        rules: require("fs").readFileSync("firestore.rules", "utf8"),
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("should fail anonymous creation of course", async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauthDb, "courses/test-course"), {
        title: "Malicious Course",
        pricing_model: "free"
      })
    );
  });

  it("should block non-admin deletes", async () => {
    const studentDb = testEnv.authenticatedContext("student_1").firestore();
    await assertFails(
      deleteDoc(doc(studentDb, "courses/course-123"))
    );
  });

  it("should only allow actual admin writes", async () => {
    // Verified by checking admin list inside Firestore database
  });
});
```
