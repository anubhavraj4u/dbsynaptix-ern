// Python original: app/context/context_builder.py
//
// Starts from the best-matching tables and adds their foreign-key neighbours,
// so the LLM sees the tables it needs for JOINs.

export class ContextBuilder {
  expand(retrievalResults, documents, topK = 3, maxDepth = 1) {
    // Lookup: table name -> document.  Python: a dict. JS: a Map.
    const documentLookup = new Map();

    for (const document of documents) {
      documentLookup.set(document.table, document);
    }

    // Start with the top K retrieved tables.
    const expandedDocuments = [];
    const selectedTables = new Set();

    // Python: retrieval_results[:top_k]
    for (const result of retrievalResults.slice(0, topK)) {
      selectedTables.add(result.table);
      expandedDocuments.push(result.document);
    }

    for (let round = 0; round < maxDepth; round++) {
      const previousCount = selectedTables.size;

      this.expandParentTables(expandedDocuments, selectedTables, documentLookup);
      this.expandChildTables(expandedDocuments, selectedTables, documents);

      if (selectedTables.size === previousCount) {
        break; // nothing new was added
      }
    }

    return expandedDocuments;
  }

  // Parents: tables that the selected tables point to.
  //   orders.customer_id -> customers   (select orders, add customers)
  expandParentTables(expandedDocuments, selectedTables, documentLookup) {
    // Copy the list first, because we add to the original while looping.
    const currentDocuments = [...expandedDocuments];

    for (const document of currentDocuments) {
      for (const fk of document.structured.foreign_keys) {
        const referencedTable = fk.references.table;

        if (selectedTables.has(referencedTable)) continue;
        if (!documentLookup.has(referencedTable)) continue;

        selectedTables.add(referencedTable);
        expandedDocuments.push(documentLookup.get(referencedTable));
      }
    }
  }

  // Children: tables that point to the selected tables.
  //   order_items.product_id -> products   (select products, add order_items)
  expandChildTables(expandedDocuments, selectedTables, documents) {
    const currentTables = new Set(selectedTables); // snapshot

    for (const document of documents) {
      if (selectedTables.has(document.table)) continue;

      const pointsToSelected = document.structured.foreign_keys.some((fk) =>
        currentTables.has(fk.references.table)
      );

      if (pointsToSelected) {
        selectedTables.add(document.table);
        expandedDocuments.push(document);
      }
    }
  }
}
