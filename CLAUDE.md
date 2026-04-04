@AGENTS.md

# UI Patterns

- Creazione e modifica di entità devono avvenire in un **popup/dialog** nella stessa pagina, NON in pagine separate. Seguire il pattern usato in `subjects/page.tsx` (Dialog + Form component con props `onSuccess`/`onClose`).

## Select (@base-ui) — valore selezionato non visibile

Il componente `Select` di `@base-ui/react` **non mostra automaticamente** il testo dell'opzione selezionata nel trigger. Bisogna renderizzare esplicitamente il contenuto di `<SelectValue>` in base al valore corrente:

```tsx
<Select value={myValue} onValueChange={setMyValue}>
  <SelectTrigger>
    <SelectValue placeholder="Seleziona...">
      {OPTIONS.find((o) => o.value === myValue)?.label ?? null}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    {OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

**MAI** usare `<SelectValue />` senza children — risulterà in un trigger vuoto dopo la selezione.

## Cursor pointer

Tutti gli elementi cliccabili (bottoni, link, card selezionabili, tab, toggle, ecc.) devono avere `cursor-pointer`. Aggiungere sempre la classe `cursor-pointer` a qualsiasi elemento `<button>` custom o elemento interattivo che non lo eredita automaticamente dal framework.
