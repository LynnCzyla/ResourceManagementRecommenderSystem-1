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
  const [isDark, setIsDark] = useState(true); // Default to Dark Theme matching the reference image

  // Apply default dark theme to body element on startup
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
    setCurrentUser(userProfile);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
  };

  return (
    <>
      {!isLoggedIn ? (
        <Login 
          onLogin={handleLogin} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      ) : currentUser.role === 'System Administrator' ? (
        <AdminLayout 
          user={currentUser} 
          onLogout={handleLogout} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      ) : currentUser.role === 'Project Manager' ? (
        <PMLayout 
          user={currentUser} 
          onLogout={handleLogout} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      ) : currentUser.role === 'Resource Manager' ? (
        <RMLayout 
          user={currentUser} 
          onLogout={handleLogout} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      ) : (
        <EmployeeLayout 
          user={currentUser} 
          onLogout={handleLogout} 
          isDark={isDark} 
          toggleTheme={toggleTheme} 
        />
      )}
    </>
  );
}

export default App;
