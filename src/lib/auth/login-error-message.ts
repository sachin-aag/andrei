/** Maps Auth.js `/login?error=` codes to copy shown on the login page. */
export function loginErrorMessage(error: string | undefined): string | null {
  if (!error) return null;

  switch (error) {
    case "Verification":
      return "This sign-in link is invalid or has expired. Request a new one, or sign in with your password.";
    case "AccessDenied":
      return "This email isn't allowed to sign in. Please contact your admin.";
    case "Configuration":
      return "Sign-in is temporarily unavailable. Please try again later or use your password.";
    default:
      return "Something went wrong signing in. Please try again, or use your password.";
  }
}
