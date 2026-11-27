
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDNArRlUHA3aYrPDqcBHKh2LDiiqGME4c0',
  authDomain: 'uttar-noltek-social-welfare.firebaseapp.com',
  projectId: 'uttar-noltek-social-welfare',
  storageBucket: 'uttar-noltek-social-welfare.firebasestorage.app',
  messagingSenderId: '585478086860',
  appId: '1:585478086860:web:e2f957ce60d2f5e59b6269',
  measurementId: 'G-ZDW79LHH89'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
