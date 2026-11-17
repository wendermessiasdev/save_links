// Copie os valores do app Web no Console do Firebase e substitua os exemplos abaixo.
// Esta configuração de cliente não contém senha. Proteja os dados com firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCESFanaGEH_oupZ2yGhCD5kpJWSs2gpSY',
  authDomain: 'meus-links-9d460.firebaseapp.com',
  projectId: 'meus-links-9d460',
  storageBucket: 'meus-links-9d460.firebasestorage.app',
  messagingSenderId: '145094221466',
  appId: '1:145094221466:web:0f10ffcaee627d95c30923'
};

export const firebaseConfigured = Object.values(firebaseConfig).every((value) =>
  typeof value === 'string' && value.length > 0 && !value.startsWith('INSIRA_') && !value.startsWith('SEU_')
);
  