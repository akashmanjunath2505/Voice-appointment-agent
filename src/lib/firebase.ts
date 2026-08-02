import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Default auth provider without calendar scopes
provider.setCustomParameters({
  prompt: "select_account",
});

let isSigningIn = false;
let cachedAccessToken: string | null = (() => {
  try {
    return localStorage.getItem("google_calendar_access_token");
  } catch (_) {
    return null;
  }
})();

const setCachedToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem("google_calendar_access_token", token);
    } else {
      localStorage.removeItem("google_calendar_access_token");
    }
  } catch (_) {}
};

// Initialize auth state listener and handle redirect results
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Handle redirect result if signInWithRedirect was used
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          setCachedToken(credential.accessToken);
          console.log("Successfully retrieved access token from redirect callback.");
          if (result.user && onAuthSuccess) {
            onAuthSuccess(result.user, credential.accessToken);
          }
        }
      }
    })
    .catch((error) => {
      console.error("Redirect auth callback error:", error);
    });

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (onAuthFailure) {
        onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;

    console.log("Attempting sign-in with Google popup...");
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error("Failed to get access token from Firebase Auth popup");
      }

      setCachedToken(credential.accessToken);
      return { user: result.user, accessToken: credential.accessToken };
    } catch (popupError: any) {
      console.warn("Popup sign-in failed or was blocked. Falling back to signInWithRedirect.", popupError);
      
      // If popup is blocked or fails (e.g. cross-origin restriction in some specific webviews), 
      // fall back to redirect.
      await signInWithRedirect(auth, provider);
      return null;
    }
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  setCachedToken(null);
};
