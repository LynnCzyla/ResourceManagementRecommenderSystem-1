// App.jsx
import React, { useState, useEffect } from 'react';
import Login from './frontend/Login';
import AdminLayout from './frontend/Admin/AdminLayout';
import PMLayout from './frontend/ProjectManager/PMLayout';
import RMLayout from './frontend/ResourceManager/RMLayout';
import EmployeeLayout from './frontend/Employee/EmployeeLayout';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const handleLogin = (userProfile) => {
    console.log('🔍 User logged in:', userProfile);
    console.log('🔍 User role:', userProfile.role);
    setCurrentUser(userProfile);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    // Clear session
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
    setIsLoggedIn(false);
  };

  // Render the appropriate layout based on role
  const renderLayout = () => {
    if (!currentUser) return null;

    const role = currentUser.role;
    console.log('Rendering layout for role:', role);

    // Check role and render appropriate layout
    switch (role) {
      case 'Admin':
        return <AdminLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      case 'Project Manager':
        return <PMLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      case 'Resource Manager':
        return <RMLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      default:
        return <EmployeeLayout user={currentUser} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
    }
  };

  return (
    <>
      {!isLoggedIn ? (
        <Login 
          onLogin={handleLogin} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      ) : (
        renderLayout()
      )}
    </>
  );
}

export default App;