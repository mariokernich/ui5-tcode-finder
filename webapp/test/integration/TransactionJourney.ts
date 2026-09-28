import opaTest from "sap/ui/test/opaQunit";
import MainPage from "./pages/MainPage";

const onTheMainPage = new MainPage();

QUnit.module("Transaction journey");

opaTest("Should show the transactions of all groups", function () {
	onTheMainPage.iStartTheAppWithoutData();

	onTheMainPage.theTableShouldHaveAsManyItemsAsTheGroupCount("ALL");
});

opaTest("Should keep the group filter while searching", function () {
	onTheMainPage.iSelectTheGroup("UI5");
	onTheMainPage.iSearchFor("se");

	onTheMainPage.theTableShouldOnlyShowTheGroup("UI5");
	onTheMainPage.theTableShouldOnlyShowMatchesFor("se");
	onTheMainPage.theTableShouldHaveAsManyItemsAsTheGroupCount("UI5");

	onTheMainPage.iSelectTheGroup("ABAP");

	onTheMainPage.theTableShouldOnlyShowTheGroup("ABAP");
	onTheMainPage.theTableShouldOnlyShowMatchesFor("se");

	onTheMainPage.iSearchFor("");

	onTheMainPage.theTableShouldOnlyShowTheGroup("ABAP");
	onTheMainPage.theTableShouldHaveAsManyItemsAsTheGroupCount("ABAP");
});

opaTest("Should list the recently used transactions", function () {
	onTheMainPage.iStubTheClipboard();
	onTheMainPage.iSelectTheGroup("ALL");
	onTheMainPage.iPressTheTransaction("SE80");
	onTheMainPage.iPressTheTransaction("SU01");
	onTheMainPage.iSelectTheGroup("RECENT");

	onTheMainPage.theTableShouldContain("SE80");
	onTheMainPage.theTableShouldContain("SU01");
	onTheMainPage.theTableShouldHaveAsManyItemsAsTheGroupCount("RECENT");

	onTheMainPage.iPressTheClearListButton();

	onTheMainPage.theTableShouldNotContain("SE80");
});

opaTest("Should add and delete a custom transaction", function () {
	onTheMainPage.iSelectTheGroup("CUSTOM");
	onTheMainPage.iPressTheNewButton();
	onTheMainPage.iPressTheDialogButton("Cancel");
	// Opening the dialog again used to fail with duplicate IDs
	onTheMainPage.iPressTheNewButton();
	onTheMainPage.iEnterTheTransaction("zopa_test", "OPA test");
	onTheMainPage.iPressTheDialogButton("Save");

	onTheMainPage.theTableShouldContain("ZOPA_TEST");

	onTheMainPage.iSelectTheTransaction("ZOPA_TEST");
	onTheMainPage.iPressTheDeleteButton();
	onTheMainPage.iPressTheDialogButton("Delete");

	onTheMainPage.theTableShouldNotContain("ZOPA_TEST");

	onTheMainPage.iTeardownTheApp();
});
