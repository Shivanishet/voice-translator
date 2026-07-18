// historyService.ts — Firestore CRUD for translation history
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type HistoryEntry = {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  translationEngine: string | null;
  createdAt: Date;
};

const COLLECTION = "translations";

/** Save a new translation to Firestore */
export async function saveTranslation(data: {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  translationEngine: string | null;
}): Promise<void> {
  await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

/** Fetch the 50 most recent translations, newest first */
export async function fetchHistory(): Promise<HistoryEntry[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const raw = d.data();
    const ts = raw.createdAt as Timestamp | null;
    return {
      id: d.id,
      originalText: raw.originalText ?? "",
      translatedText: raw.translatedText ?? "",
      sourceLanguage: raw.sourceLanguage ?? "",
      targetLanguage: raw.targetLanguage ?? "",
      translationEngine: raw.translationEngine ?? null,
      createdAt: ts ? ts.toDate() : new Date(),
    };
  });
}

/** Delete a single translation by document ID */
export async function deleteTranslation(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
