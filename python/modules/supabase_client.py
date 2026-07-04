# python/modules/supabase_client.py
"""
Python Supabase Client - Matches the JavaScript supabase.js
"""
import os
from supabase import create_client, Client
from pathlib import Path

class SupabaseClient:
    """Python wrapper for Supabase - matches the JavaScript implementation"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize Supabase client"""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            # Try loading from .env file
            self._load_env()
        
        if not self.supabase_url or not self.supabase_key:
            print("[Supabase] ❌ Missing credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
            self.client = None
            return
        
        try:
            self.client = create_client(self.supabase_url, self.supabase_key)
            print("[Supabase] [OK] Connected to Supabase")
        except Exception as e:
            print(f"[Supabase] [ERROR] Connection error: {e}")
            self.client = None
    
    def _load_env(self):
        """Load environment variables from .env file"""
        try:
            env_path = Path(__file__).resolve().parent.parent / ".env"
            if env_path.exists():
                with open(env_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            key, value = line.split('=', 1)
                            if key == 'SUPABASE_URL':
                                self.supabase_url = value.strip()
                            elif key == 'SUPABASE_SERVICE_ROLE_KEY':
                                self.supabase_key = value.strip()
        except Exception as e:
            print(f"[Supabase] Error loading .env: {e}")
    
    def get_client(self):
        """Get the Supabase client instance"""
        return self.client
    
    def table(self, table_name):
        """Get a table reference (matches JavaScript syntax)"""
        if not self.client:
            raise Exception("Supabase client not initialized")
        return self.client.table(table_name)
    
    def from_table(self, table_name):
        """Alias for table() - matches JavaScript supabase.from()"""
        return self.table(table_name)


# Singleton instance
supabase = SupabaseClient()

# Export for easy import
__all__ = ['supabase', 'SupabaseClient']