
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "relative px-6 py-3 rounded-lg font-medium text-base tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0f172a] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 border border-transparent",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700",
    outline: "bg-transparent text-slate-400 border border-slate-600 hover:text-slate-200 hover:border-slate-400 hover:bg-slate-800/50",
    danger: "bg-rose-900/30 text-rose-400 border border-rose-900 hover:bg-rose-900/50 hover:border-rose-700"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></span>
          处理中...
        </span>
      ) : children}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; actions?: React.ReactNode }> = ({ children, className = '', title, actions }) => (
  <div className={`bg-[#1e293b] border border-slate-700/50 rounded-xl shadow-xl overflow-hidden flex flex-col ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
        <h3 className="text-slate-200 text-lg font-semibold tracking-tight">
          {title}
        </h3>
        {actions && <div>{actions}</div>}
      </div>
    )}
    <div className="p-6 flex-1 relative z-10 text-slate-300">
      {children}
    </div>
  </div>
);

export const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; helperText?: string }> = ({ label, helperText, className, ...props }) => (
  <div className="mb-6">
    <label className="block text-sm font-medium text-slate-400 mb-2">{label}</label>
    <input 
      className={`w-full bg-slate-950 border border-slate-700 text-slate-100 text-lg p-3.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-600 ${className}`}
      {...props}
    />
    {helperText && <p className="mt-2 text-sm text-slate-500">{helperText}</p>}
  </div>
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; helperText?: string }> = ({ label, helperText, className, ...props }) => (
  <div className="mb-6">
    <label className="block text-sm font-medium text-slate-400 mb-2">{label}</label>
    <textarea 
      className={`w-full bg-slate-950 border border-slate-700 text-slate-100 text-base p-3.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-600 min-h-[120px] ${className}`}
      {...props}
    />
    {helperText && <p className="mt-2 text-sm text-slate-500">{helperText}</p>}
  </div>
);
