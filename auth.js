import { supabase } from './supabase.js';

// ============================
// SIGNUP LOGIC (With Super Admin Request)
// ============================
export async function handleSignup(e) {
    e.preventDefault();
    const btn = document.getElementById('signup-btn');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Check if they requested admin access
        const wantsAdmin = document.getElementById('request-admin')?.checked;
        const assignedRole = wantsAdmin ? 'pending_admin' : 'user';

        // A. Authenticate with Supabase Auth
        const { data, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (authError) throw authError;

        const user = data.user ?? data.session?.user;
        if (!user) throw new Error("Signup failed. Please try again.");

        // B. Save Extended Profile to 'users' table
        const { error: profileError } = await supabase
            .from('users')
            .insert([{
                user_id: user.id,
                full_name: document.getElementById('fullname').value,
                email: email,
                user_type: document.getElementById('user_type').value,
                college_id: document.getElementById('college_id').value,
                contact_no: document.getElementById('contact_no').value,
                course: document.getElementById('course').value,
                class_details: document.getElementById('class_details').value,
                role: assignedRole, // Assigns 'user' or 'pending_admin'
                reward_points: 0
            }]);

        if (profileError) throw profileError;

        if (wantsAdmin) {
            alert("Account created! Your admin request has been sent to the Super Admin. You will have standard access until approved.");
        } else {
            alert("Account created successfully!");
        }
        
        window.location.href = 'login.html';

    } catch (err) {
        alert("Error: " + err.message);
        btn.innerText = "Register with Connect & Found";
        btn.disabled = false;
    }
}

// ============================
// LOGIN LOGIC (The Traffic Cop)
// ============================
export async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    const errorMsg = document.getElementById('error-msg');

    errorMsg.classList.add('hidden');
    const originalBtnContent = btn.innerHTML;
    btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin text-xl"></i> Checking...`;
    btn.disabled = true;

    try {
        const { data: existingUser, error: checkError } = await supabase
            .from("users")
            .select("user_id")
            .eq("email", email)
            .maybeSingle();

        if (checkError) throw checkError;

        if (!existingUser) {
            errorMsg.textContent = "You are not registered. Redirecting to signup...";
            errorMsg.classList.remove('hidden');
            setTimeout(() => { window.location.href = "signup.html"; }, 2000);
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            if (error.message.includes("Invalid login credentials")) throw new Error("Incorrect password.");
            throw error;
        }

        const { data: userDetails, error: roleError } = await supabase
            .from('users')
            .select('role')
            .eq('user_id', data.user.id)
            .single();

        if (roleError) throw roleError;

        // Route based on role
        if (userDetails.role === 'admin' || userDetails.role === 'super_admin') {
            window.location.href = 'admin.html';
        } else {
            // 'user' and 'pending_admin' go to normal dashboard
            window.location.href = 'index.html';
        }

    } catch (err) {
        errorMsg.textContent = err.message || "Login failed.";
        errorMsg.classList.remove('hidden');
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
    }
}