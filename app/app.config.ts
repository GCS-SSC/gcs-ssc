export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc'
    },
    button: {
      slots: {
        base: 'font-black uppercase tracking-widest text-xs transition-all duration-200 active:scale-95 rounded-lg cursor-default'
      }
    },
    card: {
      slots: {
        root: 'shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800 transition-all hover:shadow-md bg-white dark:bg-zinc-900 rounded-xl',
        header: 'border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 py-4 px-6',
        body: 'p-6'
      }
    },
    table: {
      slots: {
        base: 'min-w-full border-separate border-spacing-0 overflow-x-auto',
        thead: 'bg-zinc-50 dark:bg-zinc-800/50',
        th: 'py-4 px-6 text-xs font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800',
        td: 'py-5 px-6 border-b border-zinc-100 dark:border-zinc-800/50 text-sm text-zinc-600 dark:text-zinc-400 align-middle',
        tr: 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors group'
      }
    },
    badge: {
      slots: {
        base: 'font-black uppercase tracking-tight px-2.5 py-0.5 rounded-full ring-1 ring-inset'
      }
    },
    tabs: {
      slots: {
        list: 'gap-x-8 gap-y-0 flex-wrap',
        indicator: 'bg-primary h-1 rounded-full bottom-0',
        trigger:
          'px-0 py-5 font-black uppercase tracking-widest text-xs opacity-60 data-[state=active]:opacity-100 transition-opacity'
      }
    },
    breadcrumb: {
      slots: {
        link: 'font-bold text-xs uppercase tracking-widest hover:text-primary transition-colors',
        separator: 'text-zinc-300 dark:text-zinc-700 mx-2'
      }
    },
    modal: {
      slots: {
        content: 'rounded-xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800',
        header: 'border-b border-zinc-100 dark:border-zinc-800 py-4 px-6',
        title: 'text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white',
        body: 'p-6',
        footer: 'border-t border-zinc-100 dark:border-zinc-800 p-6'
      }
    },
    formField: {
      slots: {
        root: 'w-full',
        label: 'text-xs font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5',
        hint: 'text-xs text-zinc-400 dark:text-zinc-500',
        error: 'text-xs font-bold text-red-600 dark:text-red-400 mt-1',
        description: 'text-xs text-zinc-400 dark:text-zinc-500 mt-1'
      }
    },
    input: {
      slots: {
        root: 'flex w-full',
        base: 'w-full rounded-lg border-zinc-200 dark:border-zinc-800 focus:ring-primary focus:border-primary shadow-sm transition-all'
      }
    },
    textarea: {
      slots: {
        root: 'flex w-full',
        base: 'w-full rounded-lg border-zinc-200 dark:border-zinc-800 focus:ring-primary focus:border-primary shadow-sm transition-all'
      }
    },
    select: {
      slots: {
        root: 'flex w-full',
        base: 'w-full rounded-lg border-zinc-200 dark:border-zinc-800 focus:ring-primary focus:border-primary shadow-sm transition-all cursor-default'
      }
    },
    selectMenu: {
      slots: {
        root: 'flex w-full',
        base: 'w-full rounded-lg border-zinc-200 dark:border-zinc-800 focus:ring-primary focus:border-primary shadow-sm transition-all cursor-default'
      }
    },
    switch: {
      slots: {
        root: 'ring-primary cursor-default'
      }
    },
    pagination: {
      slots: {
        list: 'gap-1',
        link: 'rounded-lg font-bold text-xs uppercase tracking-widest cursor-default'
      }
    }
  }
})
