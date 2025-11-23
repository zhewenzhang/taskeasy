
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
  const baseStyles = "relative px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-semibold text-sm md:text-base tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#0f172a] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 dark:shadow-blue-900/20 border border-transparent",
    secondary: "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm",
    outline: "bg-transparent text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50",
    danger: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin h-4 w-4 md:h-5 md:w-5 border-2 border-current border-t-transparent rounded-full"></span>
          <span className="hidden md:inline">处理中...</span>
        </span>
      ) : children}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; actions?: React.ReactNode }> = ({ children, className = '', title, actions }) => (
  <div className={`bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-sm dark:shadow-xl overflow-hidden flex flex-col transition-colors duration-300 ${className}`}>
    {title && (
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
        <h3 className="text-slate-800 dark:text-slate-200 text-lg font-bold tracking-tight">
          {title}
        </h3>
        {actions && <div>{actions}</div>}
      </div>
    )}
    <div className="p-5 md:p-6 flex-1 relative z-10 text-slate-600 dark:text-slate-300 flex flex-col min-h-0">
      {children}
    </div>
  </div>
);

export const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; helperText?: string }> = ({ label, helperText, className, ...props }) => (
  <div className="mb-5">
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-400 mb-2">{label}</label>
    <input 
      className={`w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base p-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-slate-400 dark:placeholder-slate-600 ${className}`}
      {...props}
    />
    {helperText && <p className="mt-1.5 text-xs md:text-sm text-slate-500">{helperText}</p>}
  </div>
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; helperText?: string }> = ({ label, helperText, className, ...props }) => (
  <div className="mb-5">
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-400 mb-2">{label}</label>
    <textarea 
      className={`w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base p-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-slate-400 dark:placeholder-slate-600 min-h-[120px] resize-y ${className}`}
      {...props}
    />
    {helperText && <p className="mt-1.5 text-xs md:text-sm text-slate-500">{helperText}</p>}
  </div>
);
