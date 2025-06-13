// Import the necessary React hooks and the Identity class from Semaphore
import React, { useState, useEffect } from "react";
import { Identity } from "@semaphore-protocol/identity";

// Declare Swal (SweetAlert) as a global variable to avoid TypeScript errors
declare const Swal: any;

// Define the prop types expected by the Register component
interface RegisterProps {
    identity: Identity | null; // Active identity object, can be null if not yet created
    onRegister: (secret: string) => Identity; // Function to register a new identity, passed from parent
    onClear: () => void; // Function to clear the active identity, passed from parent
}

// Main Register component, responsible for rendering the UI and managing identity registration
export default function Register({ identity, onRegister, onClear }: RegisterProps) {
  // State to store the 'secret' input from the user
  const [secret, setSecret] = useState<string>("");

  // useEffect hook that runs whenever 'identity' changes
  // Useful for logging and debugging identity status
  useEffect(() => {
    console.log("--- Register component mounted or updated ---");
    if (identity) {
      console.log(`[EFFECT] Received identity from App.tsx. Current commitment: ${identity.commitment.toString()}`);
    } else {
      console.log("[EFFECT] No active identity at the moment (identity prop is null).");
    }
  }, [identity]);

  // Function triggered when the Register or Replace button is clicked
  const handleRegisterClick = () => {
    // Validation: Ensure the 'secret' field is not empty
    if (!secret.trim()) {
        Swal.fire({ icon: 'error', title: 'Secret Key Required', text: 'Please enter a secret key.' });
        return;
    }

    // Call the onRegister function from the parent with the entered secret
    const newIdentity = onRegister(secret);
    setSecret(""); // Clear the input field after successful registration

    // Display a success notification with SweetAlert
    Swal.fire({
        icon: 'success',
        title: 'Identity Successfully Registered!',
        html: `
            <p>Your new identity has been registered and is now active across the application.</p>
            <p style="margin-top: 1rem;"><strong>Your new public commitment:</strong></p>
            <code class="identity-code">${newIdentity.commitment.toString()}</code>
        `,
    });
  };

  // Render JSX (component UI)
  return (
    <div className="card">
      <h3>Anonymous Identity Management</h3>

      {/* Conditionally render current identity status */}
      {identity ? (
        // Display when an identity is already registered
        <div className="alert alert-info">
            <p><strong>Currently Registered Identity:</strong></p>
            <code className="identity-code">{identity.commitment.toString()}</code>
            {/* Button to clear the existing identity */}
            <button onClick={onClear} className="btn btn-sm btn-danger" style={{marginTop: '1rem'}}>
                Delete This Identity
            </button>
        </div>
      ) : (
        // Display when no identity is currently registered
        <div className="alert alert-warning">
            <p>No identity is currently registered in this browser.</p>
        </div>
      )}

      <hr />

      {/* Form section to register or replace an identity */}
      <div>
        <h4>Register or Replace Identity</h4>
        <p>Use one of the predefined secrets to register.</p>

        {/* Input form for secret. Uses onSubmit to handle Enter key */}
        <form onSubmit={(e) => { e.preventDefault(); handleRegisterClick(); }}>
            <div className="form-group">
                <label htmlFor="secret-input">Secret Key</label>
                <input 
                    id="secret-input"
                    type="password"
                    className="form-control"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="e.g.: secret-user-1-!@#$"
                />
            </div>
            {/* Submit button text changes depending on current identity state */}
            <button type="submit" className="btn btn-primary" style={{marginTop: '1rem'}}>
                {identity ? "Replace with New Identity" : "Register Identity"}
            </button>
        </form>
      </div>
    </div>
  );
}
