import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, getDocs, collection, updateDoc } from "firebase/firestore";
import { readFileSync } from "fs";

describe("Firestore Security Fortress", () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "stable-tensor-f8gvj",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  // --- ATTACK VECTOR 1: COURSE PRIVILEGE ESCALATION ---

  it("1. should fail anonymous creation of course", async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauthDb, "courses/test-course"), {
        title: "Malicious Course",
        description: "An unauthenticated mock attempt.",
        thumbnail: "mock-url",
        pricing_model: "free"
      })
    );
  });

  it("2. should block non-admin deletes", async () => {
    const studentDb = testEnv.authenticatedContext("student_1", {
      email: "student@hrl.com",
      email_verified: true
    }).firestore();
    await assertFails(
      deleteDoc(doc(studentDb, "courses/course-123"))
    );
  });

  it("3. should prevent ghost-field injection on course create", async () => {
    const adminDb = testEnv.authenticatedContext("admin_123", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: true
    }).firestore();
    await assertFails(
      setDoc(doc(adminDb, "courses/course-3"), {
        title: "Polished course",
        description: "Clean description",
        thumbnail: "ok",
        pricing_model: "free",
        isSystemGlobal: true, // Ghost field
        ghostField: "malicious" // Ghost field
      })
    );
  });

  it("4. should prevent incorrect field value types (type poisoning)", async () => {
    const adminDb = testEnv.authenticatedContext("admin_123", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: true
    }).firestore();
    await assertFails(
      setDoc(doc(adminDb, "courses/course-4"), {
        title: "React Advanced",
        one_time_price: true, // Type poisoning (boolean instead of number)
        pricing_model: "one_time",
        description: "Will fail type check",
        thumbnail: "fail-thumb"
      })
    );
  });

  it("5. should block denial-of-wallet giant ID poisoning", async () => {
    const adminDb = testEnv.authenticatedContext("admin_123", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: true
    }).firestore();
    const giantId = "a".repeat(200); // Exceeds size limits (max 128)
    await assertFails(
      setDoc(doc(adminDb, `courses/${giantId}`), {
        title: "Giant ID Course",
        description: "A secure size gate should block this.",
        thumbnail: "thumb-url",
        pricing_model: "free"
      })
    );
  });

  // --- ATTACK VECTOR 2: USER PROFILE SECURITY & ROLE HIJACKING ---

  it("6. should block self-assigned admin role on user profile create", async () => {
    const maliciousDb = testEnv.authenticatedContext("user_123", {
      email: "malicious@gmail.com",
      email_verified: true
    }).firestore();
    await assertFails(
      setDoc(doc(maliciousDb, "users/user_123"), {
        email: "malicious@gmail.com",
        role: "admin" // Escalation attempt
      })
    );
  });

  it("7. should prevent cross-user profile reading", async () => {
    const studentADb = testEnv.authenticatedContext("student_A", {
      email: "student_a@gmail.com",
      email_verified: true
    }).firestore();
    await assertFails(
      getDoc(doc(studentADb, "users/student_B"))
    );
  });

  it("8. should block PII blanket leak via unrestricted list search on users", async () => {
    const studentDb = testEnv.authenticatedContext("student_A", {
      email: "student_a@gmail.com",
      email_verified: true
    }).firestore();
    await assertFails(
      getDocs(collection(studentDb, "users"))
    );
  });

  it("9. should block spoofed identity write", async () => {
    const attackerDb = testEnv.authenticatedContext("attacker_id", {
      email: "attacker@gmail.com",
      email_verified: true
    }).firestore();
    // Path has victim_id, but auth is attacker_id. block!
    await assertFails(
      setDoc(doc(attackerDb, "users/victim_id"), {
        email: "victim@gmail.com",
        role: "student"
      })
    );
  });

  it("10. should block admin operations with unverified email", async () => {
    const unverifiedAdminDb = testEnv.authenticatedContext("admin_spoof", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: false // Unverified email bypass
    }).firestore();
    await assertFails(
      setDoc(doc(unverifiedAdminDb, "courses/course-unverified"), {
        title: "Spoofed course",
        description: "Unverified admin is blocked.",
        thumbnail: "url",
        pricing_model: "free"
      })
    );
  });

  // --- ATTACK VECTOR 3: DATA INTEGRITY AND SYSTEM RULES ---

  it("11. should block modifying immutable createdAt field on course", async () => {
    const adminDb = testEnv.authenticatedContext("admin_123", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: true
    }).firestore();

    // Prepare setup (requires bypassing checks or setup with admin context)
    const setupEnv = testEnv.authenticatedContext("admin_123", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: true
    }).firestore();
    
    await assertSucceeds(
      setDoc(doc(setupEnv, "courses/immutable-course"), {
        title: "Standard course",
        description: "Valid description",
        thumbnail: "ok",
        pricing_model: "free",
        createdAt: "2026-06-03T11:00:00Z"
      })
    );

    // Try to modify the immutable createdAt timestamp
    await assertFails(
      updateDoc(doc(adminDb, "courses/immutable-course"), {
        createdAt: "2026-06-03T22:00:00Z" // Changed immutable timestamp
      })
    );
  });

  it("12. should block ID injection with path traversal non-standard characters", async () => {
    const adminDb = testEnv.authenticatedContext("admin_123", {
      email: "hardbanrecordslab.pl@gmail.com",
      email_verified: true
    }).firestore();
    await assertFails(
      setDoc(doc(adminDb, "courses/../admin_escalate"), {
        title: "Path Traversal",
        description: "Attempts traversal injection.",
        thumbnail: "ok",
        pricing_model: "free"
      })
    );
  });
});
